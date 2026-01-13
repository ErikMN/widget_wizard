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
 * - Each WebSocket client can optionally request per-process monitoring by process name.
 * - Each WebSocket client can request a one-shot list of running process names.
 * - Each WebSocket client can request one-shot filesystem storage information.
 *
 * Data flow:
 *   /proc -> stats_timer_cb() -> latest_stats
 *   latest_stats -> ws_callback() -> WebSocket clients
 *
 * Per-process monitoring:
 * - The client can send a JSON command to enable monitoring of a single process:
 *     { "monitor": "process_name" }
 * - process_name is matched against the first /proc/<pid>/comm that equals the given string.
 * - Per-process monitoring state is per WebSocket connection (per-session), not global.
 * - The server responds by adding a "proc" object to the periodic JSON snapshots:
 *     "proc": {
 *       "name": "<process_name>",
 *       "cpu": <percent>,
 *       "rss_kb": <kB>,
 *       "pss_kb": <kB>,
 *       "uss_kb": <kB>
 *     }
 * - Process CPU% is computed from (utime + stime) deltas over monotonic time.
 *   Interpretation: 100% = all CPUs fully utilized (system-wide percentage, matches top(1) default).
 * - Process RSS is reported from VmRSS in /proc/<pid>/status (kB).
 * - Process PSS and USS are reported from /proc/<pid>/smaps_rollup:
 *     - PSS (Proportional Set Size) is the kernel-accounted RAM cost of the process.
 *     - USS (Unique Set Size) is the amount of private memory that would be freed if the process exited.
 * - To stop per-process monitoring, the client sends:
 *     { "monitor": "" }
 * - If the process cannot be found, the server includes an "error" object:
 *     "error": { "type": "process_not_found", "message": "Process '<name>' not found" }
 *
 * One-shot process list:
 * - The client can request a list of running process names:
 *     { "list_processes": true }
 * - The server scans /proc/<pid>/comm, skips kernel threads ([...]),
 *   deduplicates names, and returns a bounded list:
 *     { "processes": ["name1", "name2", ...] }
 * - The list is intended for UI discovery and filtering, not as a full
 *   system process inventory.
 * - The response is size-bounded and may be truncated if limits are reached.
 *
 * One-shot storage information:
 * - The client can request filesystem usage statistics:
 *     { "storage": true }
 * - The server probes a fixed allowlist of paths using statvfs().
 * - Reported values include total, used, and available space in kilobytes.
 * - Filesystem type is resolved from /proc/self/mounts and reflects the
 *   mounted filesystem visible at that path (df-style view, e.g. "overlay",
 *   "tmpfs", "ext4"), not necessarily the underlying backing store.
 * - Storage information is returned only on explicit request and is not streamed.
 *
 * Returned JSON message format example:
 * {
 *   "ts": 1766089635269,
 *   "mono_ms": 4689109526,
 *   "delta_ms": 500,
 *   "cpu": 5.42,
 *   "cpu_cores": 4,
 *   "mem_total_kb": 981716,
 *   "mem_available_kb": 531704,
 *   "uptime_s": 4689109,
 *   "load1": 0.28,
 *   "load5": 0.34,
 *   "load15": 0.26,
 *   "clients": { "connected": 3, "max": 10 },
 *   "proc": {
 *     "name": "my_process",
 *     "pid": 12857,
 *     "cpu": 12.34,
 *     "rss_kb": 11052,
 *     "pss_kb": 7421,
 *     "uss_kb": 5310
 *   }
 * }
 *
 * Scope and limitations:
 * - Intended for local or trusted networks (no TLS or authentication).
 * - Designed for a small number of concurrent clients.
 * - Not thread-safe by design: All logic runs in the GLib main loop thread.
 * - Not intended as a general-purpose metrics system.
 */
#include <stdlib.h>
#include <dirent.h>
#include <getopt.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/statvfs.h>
#include <syslog.h>
#include <time.h>
#include <unistd.h>

#include <jansson.h>
#include <libwebsockets.h>
#include <glib/gstdio.h>
#include <glib-unix.h>
#include <axsdk/axparameter.h>

#include "globals.h"
#include "util.h"
#include "stats.h"
#include "session.h"
#include "proc.h"
#include "storage.h"
#include "json_out.h"
#include "ws_limits.h"

/* Axparameters used by this app */
#define PARAM_NAME_APPLICATION_RUNNING_PARAM "ApplicationRunning"

/* Default TCP port the WebSocket server listens on.
 *
 * Chosen as a fixed, non-privileged port for local / embedded use.
 * Must match the client connection URL (ws://<ip>:9000).
 */
#define WS_PORT_DEFAULT 9000

/* Maximum number of concurrent WebSocket clients.
 *
 * Includes both fully established connections and handshakes in progress.
 * This limit bounds resource usage and prevents unbounded /proc polling
 * and per-session state allocation.
 */
#define MAX_WS_CONNECTED_CLIENTS 10

/* scanf() field widths must be compile-time decimal literals in the format string.
 *
 * The C preprocessor cannot stringify an expression like (MAX_PROC_NAME_LENGTH - 1)
 * into a valid scanf width, so the value is defined explicitly and verified below.
 *
 * This width ensures space for the terminating NUL when scanning into
 * char proc_name[MAX_PROC_NAME_LENGTH].
 */
#define MAX_PROC_NAME_SCAN_WIDTH 63
_Static_assert(MAX_PROC_NAME_SCAN_WIDTH == MAX_PROC_NAME_LENGTH - 1,
               "MAX_PROC_NAME_SCAN_WIDTH must be MAX_PROC_NAME_LENGTH - 1");

/* Macro helpers for turning macro *values* into string literals.
 *
 * Two-step expansion is required so STR(MAX_PROC_NAME_SCAN_WIDTH)
 * expands the macro first (e.g. 5) and then stringifies it ("5").
 *
 * Used to build scanf format strings with compile-time widths.
 */
#define STR_HELPER(x) #x
#define STR(x) STR_HELPER(x)

/******************************************************************************/
/* Global app variables */
long cpu_core_count = 1;

/* Global variables for this file */
static GMainLoop *main_loop = NULL;
static struct lws_context *lws_ctx = NULL;
static guint stats_timer_id = 0;
static guint lws_service_timer_id = 0;

/* Connection accounting:
 *
 * - ws_pending_client_count is incremented in LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION.
 * - It is decremented either when the handshake completes
 *   (LWS_CALLBACK_ESTABLISHED) or when the connection is destroyed
 *   before establishment (LWS_CALLBACK_WSI_DESTROY).
 *
 * - ws_connected_client_count tracks fully established WebSocket
 *   connections only and is decremented in LWS_CALLBACK_CLOSED.
 *
 * This accounting is required because libwebsockets does not guarantee
 * that FILTER_PROTOCOL_CONNECTION is paired with ESTABLISHED or CLOSED
 * on all handshake failure paths.
 */
static unsigned int ws_pending_client_count = 0;
static unsigned int ws_connected_client_count = 0;

/******************************************************************************/

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

/******************************************************************************/

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
    struct per_session_data *pss = user;

    if (!pss || len == 0 || len >= 128) {
      break;
    }

    char msg[128 + 1];
    memcpy(msg, in, len);
    msg[len] = '\0';

    /* Parse JSON using libjansson */
    json_error_t json_error;
    json_t *root = json_loads(msg, 0, &json_error);
    if (!root || !json_is_object(root)) {
      syslog(LOG_WARNING,
             "Invalid JSON received: %s (line %d, column %d)",
             json_error.text,
             json_error.line,
             json_error.column);
      if (root) {
        json_decref(root);
      }
      break;
    }

    /* One-shot process list request: { "list_processes": true }
     *
     * NOTE:
     * This triggers a full /proc scan to build a unique process list.
     * The operation may cause brief CPU spikes when repeatedly invoked,
     * which is acceptable as it is user-initiated and not performed
     * automatically or in the background.
     */
    json_t *list_processes = json_object_get(root, "list_processes");
    if (json_is_true(list_processes)) {
      bool truncated = false;
      size_t out_len = build_process_list_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, &truncated);
      if (out_len > 0) {
        int written = lws_write(wsi, &pss->list_buf[LWS_PRE], out_len, LWS_WRITE_TEXT);
        if (written < 0) {
          syslog(LOG_WARNING, "lws_write failed");
        }
      }
      if (truncated) {
        syslog(LOG_INFO, "Process list response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
      }
      json_decref(root);
      break;
    }

    /* One-shot storage info request: { "storage": true } */
    json_t *storage_req = json_object_get(root, "storage");
    if (json_is_true(storage_req)) {
      bool truncated = false;
      size_t out_len = build_storage_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, &truncated);
      if (out_len > 0) {
        int written = lws_write(wsi, &pss->list_buf[LWS_PRE], out_len, LWS_WRITE_TEXT);
        if (written < 0) {
          syslog(LOG_WARNING, "lws_write failed");
        }
      }
      if (truncated) {
        syslog(LOG_INFO, "Storage response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
      }
      json_decref(root);
      break;
    }

    /* Expect JSON: { "monitor": "process_name" } */
    json_t *monitor = json_object_get(root, "monitor");
    if (!monitor) {
      json_decref(root);
      break;
    }

    /* Explicit stop-monitoring command: { "monitor": "" } */
    if (json_is_string(monitor) && json_string_value(monitor)[0] == '\0') {
      pss->proc_enabled = false;
      pss->proc_name[0] = '\0';
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      pss->proc_pid = 0;
      syslog(LOG_INFO, "Client stopped process monitoring");
      json_decref(root);
      break;
    }

    /* Normal start-monitoring command */
    if (json_is_string(monitor)) {
      strncpy(pss->proc_name, json_string_value(monitor), sizeof(pss->proc_name) - 1);
      pss->proc_name[sizeof(pss->proc_name) - 1] = '\0';
      pss->proc_enabled = true;
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      pss->proc_pid = 0;
      syslog(LOG_INFO, "Client monitoring process: %s", pss->proc_name);
    }
    json_decref(root);
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
    bool truncated = false;

    if (!pss) {
      break;
    }

    json_len = (int)build_stats_json(json,
                                     sizeof(json),
                                     &latest_stats,
                                     cpu_core_count,
                                     ws_connected_client_count,
                                     MAX_WS_CONNECTED_CLIENTS,
                                     pss,
                                     &truncated);
    if (json_len <= 0) {
      syslog(LOG_ERR, "JSON message truncated, dropping the frame");
      break;
    }

    /* Copy JSON to per-session buffer */
    memcpy(&pss->stream_buf[LWS_PRE], json, (size_t)json_len);

    /* Send one complete WS text message */
    int written = lws_write(wsi, &pss->stream_buf[LWS_PRE], (size_t)json_len, LWS_WRITE_TEXT);
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
    /*
     * Handshake-failure cleanup:
     *
     * FILTER_PROTOCOL_CONNECTION is not guaranteed to be paired with
     * ESTABLISHED or CLOSED on all libwebsockets failure paths.
     *
     * If this session never reached ESTABLISHED, it still holds a
     * pending slot that must be released here.
     */
    if (pss && !pss->counted) {
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

/******************************************************************************/

static const struct lws_protocols protocols[] = { {
                                                      .name = "sysstats",
                                                      .callback = ws_callback,
                                                      .per_session_data_size = sizeof(struct per_session_data),
                                                  },
                                                  { NULL, NULL, 0, 0, 0, NULL, 0 } };

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

/******************************************************************************/

int
main(int argc, char **argv)
{
  AXParameter *parameter = NULL;
  GError *error = NULL;
  int ret = 0;
  struct lws_context_creation_info info;
  int ws_port = WS_PORT_DEFAULT;

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Parse input options */
  int opt;
  while ((opt = getopt(argc, argv, "p:")) != -1) {
    switch (opt) {
    case 'p':
      ws_port = atoi(optarg);
      if (ws_port <= 0 || ws_port > 65535) {
        syslog(LOG_ERR, "Invalid port: %s", optarg);
        return EXIT_FAILURE;
      }
      break;
    default:
      syslog(LOG_ERR, "Usage: %s [-p port]", argv[0]);
      return EXIT_FAILURE;
    }
  }

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Handle Unix signals for graceful termination */
  g_unix_signal_add(SIGINT, on_unix_signal, main_loop);
  g_unix_signal_add(SIGTERM, on_unix_signal, main_loop);

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
  info.port = ws_port;
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
  /* Cache the number of online CPUs once.
   *
   * The value is constant for the lifetime of the process on typical
   * embedded systems, so caching avoids repeated sysconf() calls.
   * Fallback to 1 ensures safe division if sysconf() fails.
   */
  cpu_core_count = sysconf(_SC_NPROCESSORS_ONLN);
  if (cpu_core_count <= 0) {
    syslog(LOG_WARNING, "sysconf(_SC_NPROCESSORS_ONLN) failed, defaulting to 1 CPU");
    cpu_core_count = 1;
  }
  syslog(LOG_INFO, "Detected %ld CPU core(s)", cpu_core_count);

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

  syslog(LOG_INFO, "WebSocket server listening on port %d", ws_port);

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
