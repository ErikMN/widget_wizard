#pragma once

#include <stdint.h>
#include <glib.h>

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

/* Struct for collecting system stats */
struct sys_stats {
  /* CPU usage */
  double cpu_usage;
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

/* latest_stats is accessed only from the GLib main loop thread.
 * No locking is required as long as libwebsockets is serviced
 * exclusively via lws_service() in this loop.
 */
extern struct sys_stats latest_stats;

/* Periodic GLib timer callback that updates the global system statistics.
 *
 * This runs in the GLib main loop thread and refreshes latest_stats.
 * The data is later consumed by the WebSocket write
 * callback when sending updates to connected clients.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
gboolean stats_timer_cb(gpointer user_data);

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
void read_mem_stats(struct sys_stats *stats);

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
void read_cpu_stats(struct sys_stats *stats);

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
void read_uptime_load(struct sys_stats *stats);
