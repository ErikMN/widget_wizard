#pragma once

#include <stddef.h>
#include <stdint.h>

/* Maximum length of a single line read from /proc text files.
 *
 * Used for fgets() buffers when parsing files like /proc/stat, /proc/meminfo,
 * /proc/uptime, /proc/loadavg, and /proc/<pid>/status.
 *
 * This value is independent of MAX_WS_MESSAGE_LENGTH.
 * Lines in these files are typically much shorter, but 512 provides safe headroom.
 * On successful fgets(), the buffer is always NUL-terminated.
 */
#define MAX_PROC_LINE_LENGTH 512

/* Maximum number of per-core CPU samples retained from /proc/stat.
 *
 * This bounds the fixed-size storage embedded in struct sys_stats while
 * still covering typical embedded and desktop systems with ample headroom.
 * If a system exposes more CPUs than this limit, excess cores are ignored.
 */
#define MAX_CPU_CORE_SAMPLES 128

/* Struct for collecting system stats */
struct sys_stats {
  /* CPU usage */
  double cpu_usage;
  /* Per-core CPU usage samples */
  double cpu_per_core_usage[MAX_CPU_CORE_SAMPLES];
  size_t cpu_per_core_count;
  /* Memory usage */
  long mem_total_kb;
  long mem_available_kb;
  /* Uptime and load */
  double uptime_s;
  double load1;
  double load5;
  double load15;
  /* Timestamp */
  uint64_t timestamp_ms;
  /* Monotonic timestamp and delta */
  uint64_t monotonic_ms;
  uint64_t delta_ms;
};

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
void read_mem_stats(struct sys_stats *stats);

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
void read_cpu_stats(struct sys_stats *stats);

/* Update all fields in stats, including timestamps and delta_ms.
 *
 * This is intended to be called periodically by the caller.
 */
void update_sys_stats(struct sys_stats *stats);
