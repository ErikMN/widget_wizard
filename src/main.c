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
#include <gio/gio.h>
#include <glib/gstdio.h>
#include <pthread.h>
#include <jansson.h>
#include <libwebsockets.h>
#include <fcntl.h>

#include "common.h"

#define WS_PORT 9001
#define BUFFER_SIZE 1024

static GMainLoop *main_loop = NULL;
static int journalctl_fd = -1;
static volatile bool terminate = false;

/* List of all connected WebSocket clients */
static struct lws *clients[FD_SETSIZE];
static int num_clients = 0;

/* Mutex to protect the client list */
pthread_mutex_t clients_mutex = PTHREAD_MUTEX_INITIALIZER;

/* WebSocket callback function */
static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  (void)in;
  (void)len;
  (void)wsi;
  (void)user;

  switch (reason) {
  case LWS_CALLBACK_ESTABLISHED:
    syslog(LOG_INFO, "WebSocket connection established");

    pthread_mutex_lock(&clients_mutex);
    if (num_clients < FD_SETSIZE) {
      clients[num_clients++] = wsi;
    } else {
      syslog(LOG_ERR, "Too many clients connected.");
    }
    pthread_mutex_unlock(&clients_mutex);
    break;

  case LWS_CALLBACK_RECEIVE:
    /* Do nothing for now, since we are not expecting messages from the clients */
    break;

  case LWS_CALLBACK_CLOSED:
    syslog(LOG_INFO, "WebSocket connection closed");

    pthread_mutex_lock(&clients_mutex);
    for (int i = 0; i < num_clients; i++) {
      if (clients[i] == wsi) {
        clients[i] = clients[--num_clients];
        break;
      }
    }
    pthread_mutex_unlock(&clients_mutex);
    break;

  default:
    break;
  }

  return 0;
}

/* Thread function to handle journalctl log streaming */
static void *
journalctl_stream(void *arg)
{
  (void)arg;
  char buf[BUFFER_SIZE];
  ssize_t bytes_read;

  while (!terminate) {
    bytes_read = read(journalctl_fd, buf, sizeof(buf) - 1);
    if (bytes_read > 0) {
      buf[bytes_read] = '\0';

      pthread_mutex_lock(&clients_mutex);
      for (int i = 0; i < num_clients; i++) {
        lws_write(clients[i], (unsigned char *)buf, bytes_read, LWS_WRITE_TEXT);
        lws_callback_on_writable(clients[i]);
      }
      pthread_mutex_unlock(&clients_mutex);
    } else if (bytes_read < 0) {
      syslog(LOG_ERR, "Error reading from journalctl: %s", strerror(errno));
      break;
    }
  }

  return NULL;
}

/* Thread to run the WebSocket server */
static void *
ws_run(void *arg)
{
  (void)arg;
  struct lws_context *context = NULL;
  struct lws_context_creation_info info;

  static struct lws_protocols protocols[] = {
    { .name = "ws", .callback = ws_callback, .per_session_data_size = 0, .id = 0 }, LWS_PROTOCOL_LIST_TERM
  };
  memset(&info, 0, sizeof(info));
  info.port = WS_PORT;
  info.protocols = protocols;
  info.gid = -1;
  info.uid = -1;

  /* Set log level to error and warning only */
  lws_set_log_level(LLL_ERR | LLL_WARN, NULL);

  context = lws_create_context(&info);

  if (!context) {
    syslog(LOG_ERR, "Failed to create libwebsocket context");
    return NULL;
  }
  PRINT_GREEN("WebSocket server started on port %d\n", info.port);

  while (!terminate) {
    lws_service(context, -1);
  }
  lws_context_destroy(context);

  return NULL;
}

/* Setup WebSocket server and journalctl log streaming */
static int
ws_setup(void)
{
  pthread_t ws_thread, journal_thread;

  /* Start WebSocket server thread */
  syslog(LOG_INFO, "Start WebSocket thread");
  if (pthread_create(&ws_thread, NULL, ws_run, NULL) != 0) {
    syslog(LOG_ERR, "Failed to set up WebSocket. Terminating.");
    return -1;
  }

  /* Start journalctl process */
  int fds[2];
  if (pipe(fds) != 0) {
    syslog(LOG_ERR, "Failed to create pipe for journalctl output");
    return -1;
  }

  if (fork() == 0) {
    /* Child process: Run journalctl -f */
    dup2(fds[1], STDOUT_FILENO);
    close(fds[0]);
    execlp("journalctl", "journalctl", "-f", NULL);
    syslog(LOG_ERR, "Failed to start journalctl");
    _exit(EXIT_FAILURE);
  }

  /* Parent process: Use the read end of the pipe */
  close(fds[1]);
  journalctl_fd = fds[0];

  /* Start journalctl log streaming thread */
  syslog(LOG_INFO, "Start journalctl streaming thread");
  if (pthread_create(&journal_thread, NULL, journalctl_stream, NULL) != 0) {
    syslog(LOG_ERR, "Failed to set up journalctl streaming. Terminating.");
    return -1;
  }

  return 0;
}

/* Signal handler for termination */
static void
handle_sigterm(int signo)
{
  (void)signo;
  terminate = true;
  g_main_loop_quit(main_loop);
}

/* Setup signal handling */
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

  printf("\nHello World!\n");
  printf("%s:%d\n", __FILE__, __LINE__);

  print_debug("\n*** Development build\n");
  print_debug("Build: %s %s\n", __DATE__, __TIME__);

  init_signals();

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "Starting %s", APP_NAME);

  /* Setup websocket and journalctl tracking */
  if (ws_setup() != 0) {
    exit(EXIT_FAILURE);
  }

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Unref the main loop */
  g_main_loop_unref(main_loop);

  syslog(LOG_INFO, "Terminating %s", APP_NAME);

  /* Close application logging to syslog */
  closelog();

  return EXIT_SUCCESS;
}
