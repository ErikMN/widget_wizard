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

static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  (void)wsi;
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
  g_main_loop_quit(main_loop);
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
  AXParameter *parameter;
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

  /* Create WebSocket context */
  memset(&info, 0, sizeof(info));
  info.port = WS_PORT;
  info.protocols = protocols;
  info.gid = -1;
  info.uid = -1;

  lws_ctx = lws_create_context(&info);
  if (!lws_ctx) {
    syslog(LOG_ERR, "Failed to create libwebsockets context");
    ret = -1;
    goto exit;
  }

  /* Drive libwebsockets from GLib */
  g_timeout_add(10, lws_glib_service, lws_ctx);

  syslog(LOG_INFO, "WebSocket server listening on port %d", WS_PORT);

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Cleanup WebSocket context */
  lws_context_destroy(lws_ctx);
  lws_ctx = NULL;

  /* Unref the main loop */
  g_main_loop_unref(main_loop);

  /* Set ApplicationRunning to no */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "no", true, &error)) {
    syslog(LOG_WARNING, "Failed to set parameter %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
  }

exit:
  syslog(LOG_INFO, "Terminating %s backend.", APP_NAME);

  if (parameter) {
    ax_parameter_free(parameter);
  }

  /* Close application logging to syslog */
  closelog();

  return ret ? EXIT_FAILURE : EXIT_SUCCESS;
}
