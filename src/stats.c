#include <stdio.h>
#include <stdbool.h>

#include "app_state.h"
#include "stats.h"
#include "util.h"

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
void
read_mem_stats(struct sys_stats *stats)
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

/* Read aggregate CPU time counters from /proc/stat and compute CPU usage.
 *
 * The "cpu" line in /proc/stat exposes cumulative time counters (in jiffies)
 * since boot, split into states (user, system, idle, iowait, irq, softirq, steal).
 *
 * CPU usage is calculated as the fraction of non-idle time over the interval
 * between this call and the previous call:
 *
 *   idle_delta  = (idle + iowait) - prev_idle
 *   total_delta = total_time - prev_total
 *   usage%      = 100 * (1 - idle_delta / total_delta)
 *
 * The first call only initializes the previous counters and returns 0.0.
 * On read or parse failure, cpu_usage is set to 0.0.
 */
void
read_cpu_stats(struct sys_stats *stats)
{
  /* Buffer for reading a single line from /proc/stat */
  char line[MAX_PROC_LINE_LENGTH];
  /* Previous cumulative CPU idle time (idle + iowait), used to compute deltas */
  static unsigned long long prev_idle = 0;
  /* Previous cumulative total CPU time, used to compute deltas */
  static unsigned long long prev_total = 0;
  /* Indicates whether a baseline CPU sample has been recorded */
  static bool initialized = false;

  /* CPU time counters read from /proc/stat aggregate "cpu" line
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
   *  delta_idle  = idle_time  - previous idle_time
   *  delta_total = total_time - previous total_time
   */
  unsigned long long user, nice, system, idle, iowait;
  unsigned long long irq, softirq, steal;
  unsigned long long idle_time, total_time;
  unsigned long long delta_idle, delta_total;
  FILE *f = NULL;

  if (!stats) {
    return;
  }

  /* Default to a known value on all failure paths */
  stats->cpu_usage = 0.0;

  f = fopen("/proc/stat", "r");
  if (!f) {
    return;
  }

  if (!fgets(line, sizeof(line), f)) {
    fclose(f);
    return;
  }
  fclose(f);

  /* Read aggregate CPU line */
  if (sscanf(line,
             "cpu %llu %llu %llu %llu %llu %llu %llu %llu",
             &user,
             &nice,
             &system,
             &idle,
             &iowait,
             &irq,
             &softirq,
             &steal) != 8) {
    return;
  }

  idle_time = idle + iowait;
  total_time = user + nice + system + idle + iowait + irq + softirq + steal;

  if (!initialized) {
    prev_idle = idle_time;
    prev_total = total_time;
    initialized = true;
    return;
  }

  /* Detect counter reset or overflow */
  if (idle_time < prev_idle || total_time < prev_total) {
    prev_idle = idle_time;
    prev_total = total_time;
    return;
  }

  delta_idle = idle_time - prev_idle;
  delta_total = total_time - prev_total;

  if (delta_total > 0) {
    stats->cpu_usage = 100.0 * (1.0 - (double)delta_idle / (double)delta_total);
  }

  prev_idle = idle_time;
  prev_total = total_time;
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
void
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

/* Periodic GLib timer callback that updates the global system statistics.
 *
 * This runs in the GLib main loop thread and refreshes latest_stats.
 * The data is later consumed by the WebSocket write
 * callback when sending updates to connected clients.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
gboolean
stats_timer_cb(gpointer user_data)
{
  struct app_state *app = user_data;

  /* Read stats */
  read_cpu_stats(&app->stats);
  read_mem_stats(&app->stats);
  read_uptime_load(&app->stats);
  /* Wall-clock timestamp (real time) */
  app->stats.timestamp_ms = get_time_ms(CLOCK_REALTIME);
  /* Previous monotonic timestamp for delta calculation */
  static uint64_t prev_mono_ms = 0;
  /* Current monotonic timestamp (not affected by clock adjustments) */
  uint64_t now_mono_ms = get_time_ms(CLOCK_MONOTONIC);
  /* Store monotonic time for consumers that need stable timing */
  app->stats.monotonic_ms = now_mono_ms;
  /* Compute elapsed time since last sample using monotonic clock */
  if (prev_mono_ms != 0 && now_mono_ms >= prev_mono_ms) {
    app->stats.delta_ms = now_mono_ms - prev_mono_ms;
  } else {
    /* First sample */
    app->stats.delta_ms = 0;
  }
  /* Update previous monotonic timestamp for next interval */
  prev_mono_ms = now_mono_ms;

  return G_SOURCE_CONTINUE;
}
