/* WebSocket server for streaming system statistics
 *
 * Test with chrome-plugin "WebSocket Test Client"
 * https://chromewebstore.google.com/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn
 *
 * ws://192.168.0.90:9000
 *
 * App overview:
 * - The application runs entirely in a single GLib main loop thread.
 * - System statistics are periodically sampled from /proc and stored in app_state::stats.
 * - libwebsockets is serviced from the same GLib main loop via a timer.
 * - Each WebSocket client has its own send timer, but all clients share the same sampled statistics.
 * - Each WebSocket client can optionally request per-process monitoring by process name.
 * - Each WebSocket client can request a one-shot list of running process names.
 * - Each WebSocket client can request a one-shot filesystem storage summary.
 * - Each WebSocket client can request a one-shot system information summary.
 *
 * Data flow:
 *   /proc -> app_state.stats
 *   app_state.stats -> ws_callback() -> WebSocket clients
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
 * One-shot system information:
 * - The client can request a summary of static system information:
 *     { "system_info": true }
 * - The server responds with a single JSON object:
 *     { "system": { ... } }
 * - Returned fields include:
 *     - Kernel release and version (uname)
 *     - Machine architecture
 *     - Hostname
 *     - OS identification (best-effort)
 * - System information is returned only on explicit request and is not streamed.
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
#include <getopt.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <syslog.h>
#include <unistd.h>

#include <glib/gstdio.h>
#include <glib-unix.h>

#include "app_state.h"
#include "stats.h"
#include "proc.h"
#include "ws_server.h"
#include "platform/platform.h"

/* Axparameters used by this app */
#define PARAM_NAME_APPLICATION_RUNNING_PARAM "ApplicationRunning"

/* Default TCP port the WebSocket server listens on.
 *
 * Chosen as a fixed, non-privileged port for local / embedded use.
 * Must match the client connection URL (ws://<ip>:9000).
 */
#define WS_PORT_DEFAULT 9000

/******************************************************************************/

/* Global variables for this file */
static GMainLoop *main_loop = NULL;

/******************************************************************************/

/* Graceful shutdown handling:
 *
 * - Unix signals are integrated into the GLib main loop.
 * - Periodic timers are explicitly stopped before quitting the loop.
 * - No libwebsockets APIs are called after lws_context_destroy().
 */
static gboolean
on_unix_signal(gpointer user_data)
{
  (void)user_data;

  /* Stop WebSocket server and all its timers */
  ws_server_stop();

  if (main_loop) {
    g_main_loop_quit(main_loop);
  }

  return G_SOURCE_REMOVE;
}

/******************************************************************************/

int
main(int argc, char **argv)
{
  int ret = 0;
  int ws_port = WS_PORT_DEFAULT;
  struct app_state app;
  memset(&app, 0, sizeof(app));

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Parse input options */
  opterr = 0;
  int opt;
  while ((opt = getopt(argc, argv, "p:")) != -1) {
    switch (opt) {
    case 'p': {
      char *endptr = NULL;
      long port = strtol(optarg, &endptr, 10);
      if (optarg[0] == '\0' || *endptr != '\0' || port <= 0 || port > 65535) {
        syslog(LOG_ERR, "Invalid port: %s", optarg);
        fprintf(stderr, "Invalid port: %s\n", optarg);
        ret = -1;
        goto exit;
      }
      ws_port = (int)port;
      break;
    }
    default:
      syslog(LOG_ERR, "Usage: %s [-p port]", argv[0]);
      fprintf(stderr, "Usage: %s [-p port]\n", argv[0]);
      ret = -1;
      goto exit;
    }
  }
  /* Create the main GLib event loop */
  main_loop = g_main_loop_new(NULL, FALSE);
  if (!main_loop) {
    syslog(LOG_ERR, "Failed to create GLib main loop");
    ret = -1;
    goto exit;
  }

  /* Handle Unix signals for graceful termination */
  g_unix_signal_add(SIGINT, on_unix_signal, NULL);
  g_unix_signal_add(SIGTERM, on_unix_signal, NULL);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "%s starting WebSocket backend.", APP_NAME);

  /* Platform-specific runtime status (Axis devices only) */
  platform_status_start();

  /* Cache the number of online CPUs once. */
  proc_init_cpu_count();

  /* Start the websocket server */
  if (!ws_server_start(&app, ws_port)) {
    ret = -1;
    goto exit;
  }
  syslog(LOG_INFO, "WebSocket server listening on port %d", ws_port);

  /* Initialize latest_stats and establish CPU usage baseline */
  read_cpu_stats(&app.stats);
  read_mem_stats(&app.stats);

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Cleanup and exit the app */
exit:
  syslog(LOG_INFO, "Terminating %s backend.", APP_NAME);
  /* Cleanup WebSocket context */
  ws_server_stop();
  /* Unref the main loop */
  if (main_loop) {
    g_main_loop_unref(main_loop);
    main_loop = NULL;
  }
  /* Platform-specific runtime status (Axis devices only) */
  platform_status_stop();
  /* Close application logging to syslog */
  closelog();

  return ret ? EXIT_FAILURE : EXIT_SUCCESS;
}
