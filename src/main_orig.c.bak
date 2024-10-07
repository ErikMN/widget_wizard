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
#include <signal.h>
#include <sys/wait.h>
#include <sys/inotify.h>

#include "common.h"

#define WS_PORT 9001
#define BUFFER_SIZE 1024

#define LOG_DIR "/var/log"
#define EVENT_SIZE (sizeof(struct inotify_event))
#define EVENT_BUF_LEN (1024 * (EVENT_SIZE + 16))

static GMainLoop *main_loop = NULL;
static int log_fd = -1;
static volatile bool terminate = false;
static int inotify_fd = -1;

/* List of all connected WebSocket clients */
static struct lws *clients[FD_SETSIZE];
static int num_clients = 0;

/* Mutex to protect the client list */
pthread_mutex_t clients_mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_t ws_thread, log_thread;

/* Function to add a client to the list (thread-safe) */
static void
add_client(struct lws *wsi)
{
  pthread_mutex_lock(&clients_mutex);
  if (num_clients < FD_SETSIZE) {
    clients[num_clients++] = wsi;
  } else {
    syslog(LOG_ERR, "Too many clients connected.");
  }
  pthread_mutex_unlock(&clients_mutex);
}

/* Function to remove a client from the list (thread-safe) */
static void
remove_client(struct lws *wsi)
{
  pthread_mutex_lock(&clients_mutex);
  for (int i = 0; i < num_clients; i++) {
    if (clients[i] == wsi) {
      clients[i] = clients[--num_clients];
      break;
    }
  }
  pthread_mutex_unlock(&clients_mutex);
}

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
    add_client(wsi);
    break;

  case LWS_CALLBACK_RECEIVE:
    /* Do nothing for now, since we are not expecting messages from the clients */
    break;

  case LWS_CALLBACK_CLOSED:
    syslog(LOG_INFO, "WebSocket connection closed");
    remove_client(wsi);
    break;

  default:
    break;
  }

  return 0;
}

/* Function to initialize inotify and watch the /var/log directory */
static void
setup_inotify(void)
{
  inotify_fd = inotify_init();
  if (inotify_fd < 0) {
    syslog(LOG_ERR, "Failed to initialize inotify: %s", strerror(errno));
    exit(EXIT_FAILURE);
  }

  /* Watch the /var/log directory for file modifications */
  int wd = inotify_add_watch(inotify_fd, LOG_DIR, IN_MODIFY | IN_MOVE | IN_CREATE);
  if (wd == -1) {
    syslog(LOG_ERR, "Failed to add inotify watch on %s: %s", LOG_DIR, strerror(errno));
    exit(EXIT_FAILURE);
  }
  syslog(LOG_INFO, "Inotify is watching %s for modifications", LOG_DIR);
}

/* Thread cleanup handler for log streaming thread */
static void
log_thread_cleanup(void *arg)
{
  (void)arg;
  if (log_fd >= 0) {
    close(log_fd);
    log_fd = -1;
  }
}

/* Thread function to handle log streaming */
static void *
log_stream(void *arg)
{
  (void)arg;
  char buf[BUFFER_SIZE];
  char event_buf[EVENT_BUF_LEN];
  ssize_t bytes_read;
  volatile int event_pos = 0;

  pthread_cleanup_push(log_thread_cleanup, NULL);

  while (!terminate) {
    pthread_testcancel();

    /* Wait for inotify events (file modifications in /var/log) */
    int length = read(inotify_fd, event_buf, EVENT_BUF_LEN);
    if (length < 0) {
      syslog(LOG_ERR, "Error reading inotify events: %s", strerror(errno));
      break;
    }

    while (event_pos < length) {
      struct inotify_event *event = (struct inotify_event *)&event_buf[event_pos];

      /* Check if this is a modification event and ignore rotated log files */
      if (event->mask & IN_MODIFY) {
        char fullpath[PATH_MAX];
        snprintf(fullpath, sizeof(fullpath), "%s/%s", LOG_DIR, event->name);

        /* Open the modified file and read the new contents */
        int fd = open(fullpath, O_RDONLY);
        if (fd < 0) {
          syslog(LOG_ERR, "Failed to open modified log file %s: %s", fullpath, strerror(errno));
          event_pos += EVENT_SIZE + event->len;
          continue;
        }

        /* Read the new data */
        bytes_read = read(fd, buf, sizeof(buf) - 1);
        if (bytes_read > 0) {
          buf[bytes_read < (ssize_t)(sizeof(buf) - 1) ? bytes_read : (ssize_t)(sizeof(buf) - 1)] = '\0';

          /* Check if the log contains the word "logrotate" and skip broadcasting if found */
          if (strstr(buf, "logrotate") != NULL) {
            syslog(LOG_DEBUG, "Log event contains 'logrotate', ignoring it.");
            close(fd);
            event_pos += EVENT_SIZE + event->len;
            continue;
          }

          pthread_mutex_lock(&clients_mutex);
          for (int i = 0; i < num_clients; i++) {
            /* Buffer for WebSocket frame header and data */
            unsigned char ws_buf[LWS_PRE + BUFFER_SIZE];

            /* Data starts after LWS_PRE header */
            unsigned char *p = &ws_buf[LWS_PRE];
            memcpy(p, buf, bytes_read);

            /* Write the buffer to the client */
            int write_status = lws_write(clients[i], p, bytes_read, LWS_WRITE_TEXT);

            if (write_status < bytes_read) {
              syslog(LOG_ERR, "Error writing to client %d: %d", i, write_status);
            } else {
              lws_callback_on_writable(clients[i]);
            }
          }
          pthread_mutex_unlock(&clients_mutex);
        }
        close(fd);
      }
      event_pos += EVENT_SIZE + event->len;
    }
    event_pos = 0;
  }
  pthread_cleanup_pop(1);

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
    { .name = "ws", .callback = ws_callback, .per_session_data_size = 0, .id = 0 },
    LWS_PROTOCOL_LIST_TERM,
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
  syslog(LOG_INFO, "WebSocket server started on port %d", info.port);

  while (!terminate) {
    lws_service(context, -1);
    pthread_testcancel();
  }
  lws_context_destroy(context);

  return NULL;
}

/* Setup WebSocket server and log streaming */
static int
ws_setup(void)
{
  /* Start WebSocket server thread */
  syslog(LOG_INFO, "Starting WebSocket thread");
  if (pthread_create(&ws_thread, NULL, ws_run, NULL) != 0) {
    syslog(LOG_ERR, "Failed to set up WebSocket. Terminating.");
    return -1;
  }

  /* Set up inotify for /var/log directory */
  setup_inotify();

  /* Start log streaming thread */
  syslog(LOG_INFO, "Starting log streaming thread");
  if (pthread_create(&log_thread, NULL, log_stream, NULL) != 0) {
    syslog(LOG_ERR, "Failed to set up log streaming. Terminating.");
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

  /* Stop the WebSocket and log streaming threads */
  pthread_cancel(ws_thread);
  pthread_cancel(log_thread);

  /* Stop main loop */
  if (main_loop != NULL) {
    g_main_loop_quit(main_loop);
  }
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

  printf("\nHello %s!\n", APP_NAME);
  printf("%s:%d\n", __FILE__, __LINE__);

  print_debug("\n*** Development build\n");
  print_debug("Build: %s %s\n", __DATE__, __TIME__);

  init_signals();

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "Starting %s", APP_NAME);

  /* Setup WebSocket and log tracking */
  if (ws_setup() != 0) {
    exit(EXIT_FAILURE);
  }

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Wait for threads to finish */
  pthread_join(ws_thread, NULL);
  pthread_join(log_thread, NULL);

  /* Unref the main loop */
  g_main_loop_unref(main_loop);

  syslog(LOG_INFO, "Terminating %s", APP_NAME);

  /* Close application logging to syslog */
  closelog();

  return EXIT_SUCCESS;
}
