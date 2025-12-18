/* WebSocket server for streaming system statistics
 *
 * Test with chrome-plugin "WebSocket Test Client"
 * https://chromewebstore.google.com/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn
 *
 * ws://192.168.0.90:9000
 *
 * App overview:
 * - The application runs entirely in a single GLib main loop thread.
 * - System statistics are periodically sampled from /proc and stored in latest_stats.
 * - libwebsockets is serviced from the same GLib main loop via a timer.
 * - Each WebSocket client has its own send timer, but all clients share the same sampled statistics.
 *
 * Data flow:
 *   /proc -> stats_timer_cb() -> latest_stats
 *   latest_stats -> ws_callback() -> WebSocket clients
 *
 * Returned JSON message format example:
 * {
 *   "ts": 1766089635269,
 *   "cpu": 5.42,
 *   "mem_total_kb": 981716,
 *   "mem_available_kb": 531704,
 *   "uptime_s": 4689109,
 *   "load1": 0.28,
 *   "load5": 0.34,
 *   "load15": 0.26
 * }
 *
 * Scope and limitations:
 * - Intended for local or trusted networks (no TLS or authentication).
 * - Designed for a small number of concurrent clients.
 * - Not thread-safe by design: All logic runs in the GLib main loop thread.
 * - Not intended as a general-purpose metrics system.
 */
#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <syslog.h>
#include <time.h>

#include <libwebsockets.h>
#include <glib/gstdio.h>
#include <glib-unix.h>
#include <axsdk/axparameter.h>

#define PARAM_NAME_APPLICATION_RUNNING_PARAM "ApplicationRunning"
#define MAX_WS_MESSAGE_LENGTH 512
#define MAX_PROC_LINE_LENGTH 512
#define WS_PORT 9000
#define MAX_WS_CONNECTED_CLIENTS 10

/* Global variables */
static GMainLoop *main_loop = NULL;
static struct lws_context *lws_ctx = NULL;
static guint stats_timer_id = 0;
static guint lws_service_timer_id = 0;
/* Number of connected clients */
static unsigned int ws_connected_client_count = 0;
/* WebSocket handshakes in progress (not yet established) */
static unsigned int ws_pending_client_count = 0;

/* Function declarations */
static gboolean stats_timer_cb(gpointer user_data);

/* Per-connected WebSocket client (per-session) storage.
 * libwebsockets gives us one instance of this struct for each connection and
 * passes it back as the "user" pointer in ws_callback().
 *
 * Buffer layout:
 * - First LWS_PRE bytes: reserved for libwebsockets (must not be written)
 * - Remaining bytes: outgoing message payload (JSON)
 */
struct per_session_data {
  /* NOTE: Buffer must be large enough for biggest JSON payload */
  unsigned char buf[LWS_PRE + MAX_WS_MESSAGE_LENGTH];
  /* True if this connection was counted toward ws_connected_client_count */
  bool counted;
};

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
};

/* latest_stats is accessed only from the GLib main loop thread.
 * No locking is required as long as libwebsockets is serviced
 * exclusively via lws_service() in this loop.
 */
static struct sys_stats latest_stats;

/* Return current wall-clock time in milliseconds since the Unix epoch.
 *
 * Uses CLOCK_REALTIME so the timestamp represents real calendar time (UTC).
 *
 * On failure, returns 0. Callers can treat this as "timestamp unavailable".
 * This function performs no caching and always queries the kernel.
 */
static uint64_t
get_timestamp_ms(void)
{
  struct timespec ts;

  if (clock_gettime(CLOCK_REALTIME, &ts) != 0) {
    return 0;
  }

  /* Convert seconds + nanoseconds to milliseconds */
  return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;
}

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
static void
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
static void
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

/*
 * Statistics sampling timer:
 *
 * - The stats timer is started when the first WebSocket client connects.
 * - The stats timer is stopped when the last client disconnects.
 *
 * Rationale:
 * - Avoid unnecessary /proc polling when no clients are connected.
 * - Sampling frequency is independent of WebSocket send frequency.
 */
static void
start_stats_timer(void)
{
  if (stats_timer_id == 0) {
    stats_timer_id = g_timeout_add(500, stats_timer_cb, NULL);
  }
}

/* Stop the stats timer */
static void
stop_stats_timer(void)
{
  if (stats_timer_id != 0) {
    g_source_remove(stats_timer_id);
    stats_timer_id = 0;
  }
}

/* WebSocket protocol callback
 *
 * - Server sends periodic JSON snapshots.
 * - NOTE: Messages are write-only: incoming messages are ignored.
 * - Update rate is approximately 500 ms per client.
 * - CPU usage is reported as a percentage [0.0 - 100.0].
 * - Memory values are reported in kilobytes.
 * - The first CPU value after connect may be 0.0 due to baseline initialization.
 * - Only allow MAX_WS_CONNECTED_CLIENTS concurrent connections.
 */
static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  (void)in;

  switch (reason) {

  case LWS_CALLBACK_ESTABLISHED: {
    struct per_session_data *pss = user;

    /* Convert one pending slot to active */
    if (ws_pending_client_count > 0) {
      ws_pending_client_count--;
    }

    ws_connected_client_count++;
    pss->counted = true;

    /* If at least one connection: start the timer */
    if (ws_connected_client_count == 1) {
      start_stats_timer();
    }
    syslog(LOG_INFO, "WebSocket client connected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    /* Send immediately */
    lws_callback_on_writable(wsi);
    /* Then every 500ms */
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
    break;
  }

  /*
   * Per-client send timer:
   *
   * Each WebSocket connection has its own libwebsockets timer that
   * controls how often data is sent to that client.
   *
   * This timer:
   * - Does NOT sample system statistics.
   * - Only schedules LWS_CALLBACK_SERVER_WRITEABLE.
   *
   * All clients observe the same latest_stats snapshot.
   */
  case LWS_CALLBACK_TIMER: {
    /* Ask lws for a writeable callback */
    lws_callback_on_writable(wsi);
    /* Rearm timer for next tick */
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
    break;
  }

  case LWS_CALLBACK_RECEIVE: {
    /* Log received data */
    syslog(LOG_INFO, "WebSocket received %zu bytes", len);
    break;
  }

  case LWS_CALLBACK_CLOSED: {
    struct per_session_data *pss = user;

    if (pss && pss->counted) {
      if (ws_connected_client_count > 0) {
        ws_connected_client_count--;
      }
      /* If no connections: Stop the timer */
      if (ws_connected_client_count == 0) {
        stop_stats_timer();
      }
    }
    syslog(LOG_INFO, "WebSocket client disconnected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    break;
  }

  case LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION: {
    /* Enforce connection limit across both established and in-progress WebSocket handshakes */
    if (ws_connected_client_count + ws_pending_client_count >= MAX_WS_CONNECTED_CLIENTS) {
      syslog(LOG_WARNING, "Rejecting WebSocket connection: client limit (%u) reached", MAX_WS_CONNECTED_CLIENTS);
      return -1;
    }

    /* Reserve a slot for this connection attempt */
    ws_pending_client_count++;

    break;
  }

  case LWS_CALLBACK_SERVER_WRITEABLE: {
    struct per_session_data *pss = user;
    char json[MAX_WS_MESSAGE_LENGTH];
    int json_len;

    if (!pss) {
      break;
    }
    /* Construct the JSON response */
    json_len = snprintf(json,
                        sizeof(json),
                        "{ \"ts\": %" PRIu64 ", \"cpu\": %.2f, \"mem_total_kb\": %ld, \"mem_available_kb\": %ld, "
                        "\"uptime_s\": %.0f, \"load1\": %.2f, \"load5\": %.2f, \"load15\": %.2f }",
                        latest_stats.timestamp_ms,
                        latest_stats.cpu_usage,
                        latest_stats.mem_total_kb,
                        latest_stats.mem_available_kb,
                        latest_stats.uptime_s,
                        latest_stats.load1,
                        latest_stats.load5,
                        latest_stats.load15);
    if (json_len < 0) {
      break;
    }
    /* Truncated output! */
    if ((size_t)json_len >= sizeof(json)) {
      syslog(LOG_ERR, "JSON message truncated, dropping the frame");
      break;
    }
    /* Copy JSON to per-session buffer */
    memcpy(&pss->buf[LWS_PRE], json, (size_t)json_len);

    /* Send one complete WS text message */
    int written = lws_write(wsi, &pss->buf[LWS_PRE], (size_t)json_len, LWS_WRITE_TEXT);
    if (written < 0) {
      syslog(LOG_WARNING, "lws_write failed");
      break;
    }
    if (written != json_len) {
      /* Short write: do not attempt to send the remainder as a new TEXT frame */
      syslog(LOG_WARNING, "short write: %d of %d", written, json_len);
    }
    break;
  }

  case LWS_CALLBACK_WSI_DESTROY: {
    struct per_session_data *pss = user;

    /* Handshake-failure cleanup: CLOSED is not guaranteed after FILTER_PROTOCOL_CONNECTION */
    if (!pss || !pss->counted) {
      if (ws_pending_client_count > 0) {
        ws_pending_client_count--;
      }
    }
    break;
  }

  default:
    break;
  }

  return 0;
}

static const struct lws_protocols protocols[] = { {
                                                      .name = "sysstats",
                                                      .callback = ws_callback,
                                                      .per_session_data_size = sizeof(struct per_session_data),
                                                  },
                                                  { NULL, NULL, 0, 0, 0, NULL, 0 } };

/* Periodic GLib timer callback that updates the global system statistics.
 *
 * This runs in the GLib main loop thread and refreshes latest_stats.
 * The data is later consumed by the WebSocket write
 * callback when sending updates to connected clients.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
static gboolean
stats_timer_cb(gpointer user_data)
{
  (void)user_data;

  /* Read stats */
  read_cpu_stats(&latest_stats);
  read_mem_stats(&latest_stats);
  read_uptime_load(&latest_stats);
  latest_stats.timestamp_ms = get_timestamp_ms();

  return G_SOURCE_CONTINUE;
}

/* Periodic GLib timer callback that drives libwebsockets from the GLib main loop.
 *
 * libwebsockets is not automatically integrated with GLib, so we call
 * lws_service() periodically to allow it to process network events.
 *
 * The timeout argument (1ms) is the maximum time lws_service() may block
 * while waiting for network activity.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
static gboolean
lws_glib_service(gpointer user_data)
{
  struct lws_context *context = user_data;

  /* Service libwebsockets may block up to 1ms */
  lws_service(context, 1);

  return G_SOURCE_CONTINUE;
}

/* Graceful shutdown handling:
 *
 * - Unix signals are integrated into the GLib main loop.
 * - Periodic timers are explicitly stopped before quitting the loop.
 * - No libwebsockets APIs are called after lws_context_destroy().
 */
static gboolean
on_unix_signal(gpointer user_data)
{
  GMainLoop *main_loop = user_data;

  /* Stop periodic timers to allow clean shutdown */
  if (stats_timer_id != 0) {
    g_source_remove(stats_timer_id);
    stats_timer_id = 0;
  }
  if (lws_service_timer_id != 0) {
    g_source_remove(lws_service_timer_id);
    lws_service_timer_id = 0;
  }
  if (main_loop) {
    g_main_loop_quit(main_loop);
  }

  return G_SOURCE_REMOVE;
}

int
main(int argc, char **argv)
{
  (void)argc;
  (void)argv;
  AXParameter *parameter = NULL;
  GError *error = NULL;
  int ret = 0;
  struct lws_context_creation_info info;

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Handle Unix signals for graceful termination */
  g_unix_signal_add(SIGINT, on_unix_signal, main_loop);
  g_unix_signal_add(SIGTERM, on_unix_signal, main_loop);

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "%s starting WebSocket backend.", APP_NAME);

  /* Create AXParameter */
  parameter = ax_parameter_new(APP_NAME, &error);
  if (parameter == NULL) {
    syslog(LOG_WARNING, "Failed to create parameter: %s", error->message);
    ret = -1;
    goto exit;
  }

  /* Set ApplicationRunning to yes */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "yes", true, &error)) {
    syslog(LOG_WARNING, "Failed to set parameter %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
  }
  if (error) {
    g_error_free(error);
    error = NULL;
  }

  /* Create WebSocket context */
  memset(&info, 0, sizeof(info));
  info.port = WS_PORT;
  info.protocols = protocols;
  info.gid = -1;
  info.uid = -1;

  /* Set log level to error and warning only */
  lws_set_log_level(LLL_ERR | LLL_WARN, NULL);

  lws_ctx = lws_create_context(&info);
  if (!lws_ctx) {
    syslog(LOG_ERR, "Failed to create libwebsockets context");
    ret = -1;
    goto exit;
  }

  /* Initialize latest_stats and establish CPU usage baseline */
  read_cpu_stats(&latest_stats);
  read_mem_stats(&latest_stats);

  /* Drive libwebsockets and system statistics from the GLib main loop.
   *
   * - lws_glib_service(): periodically services libwebsockets so it can
   *   process network events and invoke protocol callbacks.
   * - stats_timer_cb(): periodically polls system statistics and
   *   updates latest_stats. This function is started/stopped dynamically based
   *   on whether there are any connected WebSocket clients.
   */
  lws_service_timer_id = g_timeout_add(10, lws_glib_service, lws_ctx);

  syslog(LOG_INFO, "WebSocket server listening on port %d", WS_PORT);

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Set ApplicationRunning to no */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "no", true, &error)) {
    syslog(LOG_WARNING, "Failed to set parameter %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
  }
  if (error) {
    g_error_free(error);
    error = NULL;
  }

exit:
  syslog(LOG_INFO, "Terminating %s backend.", APP_NAME);
  /* Cleanup WebSocket context */
  if (lws_ctx) {
    lws_context_destroy(lws_ctx);
    lws_ctx = NULL;
  }
  /* Unref the main loop */
  if (main_loop) {
    g_main_loop_unref(main_loop);
    main_loop = NULL;
  }
  /* Free axparameter */
  if (parameter) {
    ax_parameter_free(parameter);
  }
  /* Close application logging to syslog */
  closelog();

  return ret ? EXIT_FAILURE : EXIT_SUCCESS;
}
