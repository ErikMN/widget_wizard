/* WebSocket server for streaming system statistics
 * Test with chrome-plugin "WebSocket Test Client"
 * https://chromewebstore.google.com/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn
 *
 * ws://192.168.0.90:9000
 */
#include <stdio.h>
#include <ctype.h>
#include <stdlib.h>
#include <unistd.h>
#include <libgen.h>
#include <errno.h>
#include <string.h>
#include <getopt.h>
#include <sys/types.h>
#include <stdbool.h>
#include <sys/stat.h>
#include <limits.h>
#include <assert.h>
#include <stdint.h>
#include <math.h>
#include <syslog.h>
#include <signal.h>

#include <libwebsockets.h>
#include <glib/gstdio.h>
#include <glib.h>
#include <axsdk/axparameter.h>

#define PARAM_NAME_APPLICATION_RUNNING_PARAM "ApplicationRunning"
#define WS_PORT 9000

static GMainLoop *main_loop = NULL;
static struct lws_context *lws_ctx = NULL;

/* Struct for collecting system stats */
struct sys_stats {
  double cpu_usage;
  long mem_total_kb;
  long mem_available_kb;
};

static struct sys_stats latest_stats;

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
static void
read_mem_stats(struct sys_stats *stats)
{
  char key[64];
  char unit[16];
  char line[256];
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
 */
static void
read_cpu_stats(struct sys_stats *stats)
{
  char line[256];
  static unsigned long long prev_idle = 0;
  static unsigned long long prev_total = 0;
  static int initialized = 0;
  unsigned long long user, nice, system, idle, iowait;
  unsigned long long irq, softirq, steal;
  unsigned long long guest, guest_nice;
  unsigned long long idle_time, total_time;
  unsigned long long delta_idle, delta_total;
  FILE *f;

  if (!stats) {
    return;
  }

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
             "cpu %llu %llu %llu %llu %llu %llu %llu %llu %llu %llu",
             &user,
             &nice,
             &system,
             &idle,
             &iowait,
             &irq,
             &softirq,
             &steal,
             &guest,
             &guest_nice) < 8) {
    return;
  }

  idle_time = idle + iowait;
  total_time = user + nice + system + idle + iowait + irq + softirq + steal;

  if (!initialized) {
    prev_idle = idle_time;
    prev_total = total_time;
    stats->cpu_usage = 0.0;
    initialized = 1;
    return;
  }

  if (idle_time < prev_idle || total_time < prev_total) {
    prev_idle = idle_time;
    prev_total = total_time;
    stats->cpu_usage = 0.0;
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

static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  (void)user;
  (void)in;

  switch (reason) {

  case LWS_CALLBACK_ESTABLISHED:
    syslog(LOG_INFO, "WebSocket client connected");
    break;

  case LWS_CALLBACK_RECEIVE:
    /* Log received data */
    syslog(LOG_INFO, "WebSocket received %zu bytes", len);
    break;

  case LWS_CALLBACK_CLOSED:
    syslog(LOG_INFO, "WebSocket client disconnected");
    break;

  case LWS_CALLBACK_SERVER_WRITEABLE: {
    char json[256];
    unsigned char buf[LWS_PRE + 256];
    unsigned char *p = &buf[LWS_PRE];

    int json_len = snprintf(json,
                            sizeof(json),
                            "{ \"cpu\": %.2f, \"mem_total_kb\": %ld, \"mem_available_kb\": %ld }",
                            latest_stats.cpu_usage,
                            latest_stats.mem_total_kb,
                            latest_stats.mem_available_kb);
    if (json_len < 0) {
      break;
    }
    if ((size_t)json_len >= sizeof(json)) {
      /* NOTE: Truncated output! */
      json_len = (int)(sizeof(json) - 1);
    }
    if ((size_t)json_len > sizeof(buf) - LWS_PRE) {
      /* Should not happen if sizes match but guard it anyway */
      json_len = (int)(sizeof(buf) - LWS_PRE);
    }
    memcpy(p, json, (size_t)json_len);
    int written = lws_write(wsi, p, (size_t)json_len, LWS_WRITE_TEXT);
    if (written < 0) {
      syslog(LOG_WARNING, "lws_write failed");
    }
    /* NOTE: re-arm writable for continuous streaming */
    lws_callback_on_writable(wsi);
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
                                                      .per_session_data_size = 0,
                                                      .rx_buffer_size = 0,
                                                      .id = 0,
                                                      .user = NULL,
                                                      .tx_packet_size = 0,
                                                  },
                                                  { NULL, NULL, 0, 0, 0, NULL, 0 } };

static gboolean
stats_timer_cb(gpointer user_data)
{
  (void)user_data;

  /* Read stats */
  read_cpu_stats(&latest_stats);
  read_mem_stats(&latest_stats);

  /* Notify all websocket clients that data is ready */
  lws_callback_on_writable_all_protocol(lws_ctx, &protocols[0]);

  return G_SOURCE_CONTINUE;
}

static gboolean
lws_glib_service(gpointer user_data)
{
  struct lws_context *context = user_data;

  /* Non-blocking service */
  lws_service(context, 0);

  return G_SOURCE_CONTINUE;
}

static void
handle_sigterm(int signo)
{
  (void)signo;
  if (main_loop) {
    g_main_loop_quit(main_loop);
  }
}

static void
init_signals(void)
{
  struct sigaction sa;
  sa.sa_flags = 0;
  sigemptyset(&sa.sa_mask);
  sa.sa_handler = handle_sigterm;
  sigaction(SIGTERM, &sa, NULL);
  sigaction(SIGINT, &sa, NULL);
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

  init_signals();

  main_loop = g_main_loop_new(NULL, FALSE);

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

  /* Drive libwebsockets from GLib */
  g_timeout_add(50, lws_glib_service, lws_ctx);
  g_timeout_add(500, stats_timer_cb, NULL);

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
  if (parameter) {
    ax_parameter_free(parameter);
  }

  /* Close application logging to syslog */
  closelog();

  return ret ? EXIT_FAILURE : EXIT_SUCCESS;
}
