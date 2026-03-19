#include <stdio.h>
#include <stdbool.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "stats.h"
#include "util.h"

/* Parse one "cpu" or "cpuN" line from /proc/stat.
 *
 * Returns true when the line contains the expected 8 CPU counters.
 * idle_time_out receives idle + iowait and total_time_out receives the sum
 * of all parsed counters so callers can compute interval deltas.
 */
static bool
parse_cpu_stat_line(const char *line,
                    char *label_out,
                    size_t label_out_size,
                    unsigned long long *idle_time_out,
                    unsigned long long *total_time_out)
{
  char parsed_label[16];
  /* CPU time counters read from /proc/stat "cpu" / "cpuN" lines
   *  user      - Time spent executing user-space processes
   *  nice      - Time spent executing user-space processes with a non-zero nice value
   *  system    - Time spent executing kernel-space processes
   *  idle      - Time spent idle
   *  iowait    - Time spent idle while waiting for I/O
   *  irq       - Time spent servicing hardware interrupts
   *  softirq   - Time spent servicing software interrupts
   *  steal     - Time stolen by the hypervisor (virtualized systems)
   *
   * Derived values:
   *  idle_time   = idle + iowait
   *  total_time  = Sum of all CPU time counters
   */
  unsigned long long user = 0;
  unsigned long long nice = 0;
  unsigned long long system = 0;
  unsigned long long idle = 0;
  unsigned long long iowait = 0;
  unsigned long long irq = 0;
  unsigned long long softirq = 0;
  unsigned long long steal = 0;

  if (!line || !label_out || label_out_size == 0 || !idle_time_out || !total_time_out) {
    return false;
  }
  /* Parse one aggregate "cpu" or per-core "cpuN" line */
  if (sscanf(line,
             "%15s %llu %llu %llu %llu %llu %llu %llu %llu",
             parsed_label,
             &user,
             &nice,
             &system,
             &idle,
             &iowait,
             &irq,
             &softirq,
             &steal) != 9) {
    return false;
  }
  snprintf(label_out, label_out_size, "%s", parsed_label);
  *idle_time_out = idle + iowait;
  *total_time_out = user + nice + system + idle + iowait + irq + softirq + steal;

  return true;
}

/* Parse the numeric CPU index from a "cpuN" label */
static bool
parse_cpu_index(const char *label, size_t *cpu_index_out)
{
  char *endptr = NULL;
  unsigned long value = 0;
  const size_t cpu_prefix_length = strlen("cpu");

  if (!label || !cpu_index_out) {
    return false;
  }
  /* Accept only numbered per-core labels such as "cpu0" or "cpu7" */
  if (strncmp(label, "cpu", cpu_prefix_length) != 0 || label[cpu_prefix_length] == '\0' ||
      !isdigit((unsigned char)label[cpu_prefix_length])) {
    return false;
  }
  /* Parse the numeric suffix and reject labels that are not clean "cpuN" values */
  value = strtoul(label + cpu_prefix_length, &endptr, 10);
  if (*endptr != '\0') {
    return false;
  }
  *cpu_index_out = (size_t)value;

  return true;
}

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
void
stats_read_mem(struct sys_stats *stats)
{
  char line[MAX_PROC_LINE_LENGTH];
  long value = 0;
  int got_total = 0;
  int got_avail = 0;
  FILE *f;

  if (!stats) {
    return;
  }

  /* Clear old values */
  stats->mem_total_kb = 0;
  stats->mem_available_kb = 0;

  f = fopen("/proc/meminfo", "r");
  if (!f) {
    return;
  }

  while (fgets(line, sizeof(line), f)) {
    if (!got_total) {
      if (sscanf(line, "MemTotal: %ld kB", &value) == 1) {
        stats->mem_total_kb = value;
        got_total = 1;
        continue;
      }
    }

    if (!got_avail) {
      if (sscanf(line, "MemAvailable: %ld kB", &value) == 1) {
        stats->mem_available_kb = value;
        got_avail = 1;
        continue;
      }
    }

    if (got_total && got_avail) {
      break;
    }
  }

  fclose(f);
}

/* Read CPU time counters from /proc/stat and compute usage.
 *
 * The aggregate "cpu" line is used to populate cpu_usage and the "cpuN" lines
 * are used to populate cpu_per_core_usage[].
 *
 * CPU usage is calculated as the fraction of non-idle time over the interval
 * between this call and the previous call:
 *
 *   idle_delta  = (idle + iowait) - prev_idle
 *   total_delta = total_time - prev_total
 *   usage%      = 100 * (1 - idle_delta / total_delta)
 *
 * The first call only initializes the previous counters and returns 0.0
 * samples. On read or parse failure, cpu_usage is set to 0.0 and the per-core
 * array is left empty.
 */
void
stats_read_cpu_stats(struct sys_stats *stats)
{
  const size_t cpu_prefix_length = strlen("cpu");
  /* Buffer for reading a single line from /proc/stat */
  char line[MAX_PROC_LINE_LENGTH];
  /* Parsed CPU label from /proc/stat, e.g. "cpu" or "cpu7" */
  char label[16];
  /* Previous cumulative CPU idle time (idle + iowait), used to compute deltas */
  static unsigned long long prev_idle = 0;
  /* Previous cumulative total CPU time, used to compute deltas */
  static unsigned long long prev_total = 0;
  /* Previous per-core idle counters (idle + iowait), indexed by parsed CPU number */
  static unsigned long long prev_core_idle[MAX_CPU_CORE_SAMPLES];
  /* Previous per-core total counters, indexed by parsed CPU number */
  static unsigned long long prev_core_total[MAX_CPU_CORE_SAMPLES];
  /* Number of cached per-core baselines currently stored */
  static size_t prev_core_count = 0;
  /* Indicates whether a baseline CPU sample has been recorded */
  static bool initialized = false;

  /* Derived CPU counters and deltas used to calculate usage percentages */
  unsigned long long idle_time = 0;
  unsigned long long total_time = 0;
  unsigned long long delta_idle = 0;
  unsigned long long delta_total = 0;
  size_t cpu_index = 0;
  size_t max_cpu_index_seen = 0;
  /* Tracks whether the aggregate "cpu" line was seen in this sample */
  bool saw_aggregate = false;
  FILE *f = NULL;

  if (!stats) {
    return;
  }

  /* Default to a known value on all failure paths */
  stats->cpu_usage = 0.0;
  stats->cpu_per_core_count = 0;
  memset(stats->cpu_per_core_usage, 0, sizeof(stats->cpu_per_core_usage));

  f = fopen("/proc/stat", "r");
  if (!f) {
    return;
  }

  /* Iterate the aggregate "cpu" line followed by the per-core "cpuN" lines. */
  while (fgets(line, sizeof(line), f)) {
    /* /proc/stat lists the aggregate CPU line and then cpuN lines first.
     * Once a non-CPU line is reached, there are no more per-core entries to parse.
     */
    if (strncmp(line, "cpu", cpu_prefix_length) != 0) {
      break;
    }
    /* Parse one "cpu" or "cpuN" line from /proc/stat */
    if (!parse_cpu_stat_line(line, label, sizeof(label), &idle_time, &total_time)) {
      continue;
    }
    /* The aggregate "cpu" line represents combined time across all CPUs.
     * Handle it separately so stats->cpu_usage keeps the existing whole-system value,
     * while the remaining "cpuN" lines populate per-core samples below.
     */
    if (strcmp(label, "cpu") == 0) {
      saw_aggregate = true;

      if (!initialized) {
        prev_idle = idle_time;
        prev_total = total_time;
        continue;
      }

      /* Detect counter reset or overflow */
      if (idle_time < prev_idle || total_time < prev_total) {
        prev_idle = idle_time;
        prev_total = total_time;
        continue;
      }

      /* Compute aggregate CPU deltas over the current sampling interval */
      delta_idle = idle_time - prev_idle;
      delta_total = total_time - prev_total;

      /* Convert the aggregate deltas into a usage percentage for this interval */
      if (delta_total > 0) {
        stats->cpu_usage = 100.0 * (1.0 - (double)delta_idle / (double)delta_total);
      }

      prev_idle = idle_time;
      prev_total = total_time;
      continue;
    }

    /* Ignore any "cpu" labels that are not numbered per-core entries */
    if (!parse_cpu_index(label, &cpu_index)) {
      continue;
    }
    /* Ignore any additional cores beyond the fixed per-core sample buffer */
    if (cpu_index >= MAX_CPU_CORE_SAMPLES) {
      continue;
    }
    if (cpu_index + 1 > max_cpu_index_seen) {
      max_cpu_index_seen = cpu_index + 1;
    }
    /* First sample for this core: store a baseline and wait for the next interval */
    if (!initialized || cpu_index >= prev_core_count) {
      prev_core_idle[cpu_index] = idle_time;
      prev_core_total[cpu_index] = total_time;
      continue;
    }
    /* Reset the per-core baseline if counters move backwards or wrap */
    if (idle_time < prev_core_idle[cpu_index] || total_time < prev_core_total[cpu_index]) {
      prev_core_idle[cpu_index] = idle_time;
      prev_core_total[cpu_index] = total_time;
      continue;
    }
    /* Compute per-core deltas over the current sampling interval */
    delta_idle = idle_time - prev_core_idle[cpu_index];
    delta_total = total_time - prev_core_total[cpu_index];

    /* Convert the per-core deltas into a usage percentage for this interval. */
    if (delta_total > 0) {
      stats->cpu_per_core_usage[cpu_index] = 100.0 * (1.0 - (double)delta_idle / (double)delta_total);
    }
    prev_core_idle[cpu_index] = idle_time;
    prev_core_total[cpu_index] = total_time;
  }
  fclose(f);

  /* Ignore the sample if the aggregate "cpu" line was not found */
  if (!saw_aggregate) {
    return;
  }
  /* Keep the highest parsed CPU index seen in this pass, plus one */
  stats->cpu_per_core_count = max_cpu_index_seen;
  /* Save the current core count and mark CPU sampling as initialized */
  prev_core_count = max_cpu_index_seen;
  if (!initialized) {
    initialized = true;
  }
}

/* Read system uptime and load averages.
 *
 * Data sources:
 * - /proc/uptime:
 *     First value  -> system uptime in seconds since boot
 *     Second value -> cumulative idle time across all CPUs (ignored)
 *
 * - /proc/loadavg:
 *     load1  -> 1-minute load average
 *     load5  -> 5-minute load average
 *     load15 -> 15-minute load average
 *
 * On any read or parse failure, the corresponding values remain zero.
 * This function performs no caching and always reads directly from /proc.
 */
static void
read_uptime_load(struct sys_stats *stats)
{
  char line[MAX_PROC_LINE_LENGTH];
  FILE *f = NULL;

  if (!stats) {
    return;
  }

  stats->uptime_s = 0.0;
  stats->load1 = 0.0;
  stats->load5 = 0.0;
  stats->load15 = 0.0;

  f = fopen("/proc/uptime", "r");
  if (f) {
    double up = 0.0;
    double idle = 0.0;
    if (fgets(line, sizeof(line), f)) {
      if (sscanf(line, "%lf %lf", &up, &idle) == 2) {
        stats->uptime_s = up;
      }
    }
    fclose(f);
  }

  f = fopen("/proc/loadavg", "r");
  if (f) {
    double a = 0.0, b = 0.0, c = 0.0;
    if (fgets(line, sizeof(line), f)) {
      if (sscanf(line, "%lf %lf %lf", &a, &b, &c) == 3) {
        stats->load1 = a;
        stats->load5 = b;
        stats->load15 = c;
      }
    }
    fclose(f);
  }
}

/* Update all system statistics and timestamps.
 *
 * Responsibilities:
 * - Refresh CPU, memory, uptime, and load fields by reading from /proc.
 * - Record a wall-clock timestamp (CLOCK_REALTIME) suitable for external correlation.
 * - Record a monotonic timestamp (CLOCK_MONOTONIC) suitable for measuring intervals.
 * - Compute delta_ms as the elapsed monotonic time since the previous update.
 *
 * Notes:
 * - delta_ms is 0 on the first call (no previous monotonic baseline).
 * - This function performs no locking; the caller must ensure single-threaded access.
 */
void
stats_update_sys_stats(struct sys_stats *stats)
{
  if (!stats) {
    return;
  }
  /* Read stats */
  stats_read_cpu_stats(stats);
  stats_read_mem(stats);
  read_uptime_load(stats);

  /* Wall-clock timestamp (real time) */
  stats->timestamp_ms = util_get_time_ms(CLOCK_REALTIME);

  /* Previous monotonic timestamp for delta calculation */
  static uint64_t prev_mono_ms = 0;
  /* Current monotonic timestamp (not affected by clock adjustments) */
  uint64_t now_mono_ms = util_get_time_ms(CLOCK_MONOTONIC);
  /* Store monotonic time for consumers that need stable timing */
  stats->monotonic_ms = now_mono_ms;
  /* Compute elapsed time since last sample using monotonic clock */
  if (prev_mono_ms != 0 && now_mono_ms >= prev_mono_ms) {
    stats->delta_ms = now_mono_ms - prev_mono_ms;
  } else {
    /* First sample */
    stats->delta_ms = 0;
  }
  /* Update previous monotonic timestamp for next interval */
  prev_mono_ms = now_mono_ms;
}
