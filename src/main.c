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

#define LOG_DIR "/var/log"
#define BUFFER_SIZE ((sizeof(struct inotify_event) + FILENAME_MAX) * 1024)
#define MAX_LOG_LINES 512
#define WS_PORT 9001

static volatile bool terminate = false;

/* Structure to hold WebSocket-specific user data */
struct per_session_data {
  int id;
};

/* Shared buffer to store log updates */
static char log_buffer[MAX_LOG_LINES][512];
static int log_index = 0;

/* Function to add a log line to the buffer */
static pthread_mutex_t log_mutex = PTHREAD_MUTEX_INITIALIZER;

static void
add_log_line(const char *line)
{
  pthread_mutex_lock(&log_mutex);
  snprintf(log_buffer[log_index % MAX_LOG_LINES], sizeof(log_buffer[log_index % MAX_LOG_LINES]), "%s", line);
  log_index++;
  pthread_mutex_unlock(&log_mutex);
}

/* WebSocket callback function */
static int
websocket_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  (void)in;
  (void)len;
  (void)wsi;
  (void)user;

  struct per_session_data *pss = (struct per_session_data *)user;

  switch (reason) {
  case LWS_CALLBACK_ESTABLISHED:
    printf("Client connected: id = %d\n", pss->id);
    pss->id = log_index; /* Start sending logs from the latest point */
    break;

  case LWS_CALLBACK_SERVER_WRITEABLE:
    if (pss->id < log_index) {
      /* Send the next log line to the client */
      unsigned char buffer[LWS_PRE + 512];
      int log_offset = pss->id % MAX_LOG_LINES;
      int log_len = strlen(log_buffer[log_offset]);
      memcpy(&buffer[LWS_PRE], log_buffer[log_offset], log_len);
      lws_write(wsi, &buffer[LWS_PRE], log_len, LWS_WRITE_TEXT);
      pss->id++;
    }
    break;

  case LWS_CALLBACK_RECEIVE:
    /* Handle incoming messages from the client, if any */
    break;

  case LWS_CALLBACK_CLOSED:
    printf("Client disconnected: id = %d\n", pss->id);
    break;

  default:
    break;
  }

  return 0;
}

/* Protocols definition */
static struct lws_protocols protocols[] = {
  {
      "log-protocol",                  /* Protocol name */
      websocket_callback,              /* Callback for this protocol */
      sizeof(struct per_session_data), /* Size of per-session data */
      512,                             /* Maximum size of a WebSocket message */
      0,                               /* id (can be 0 if not used) */
      NULL,                            /* user (can be NULL if not used) */
      0,                               /* tx_packet_size (set to 0 if not needed) */
  },
  LWS_PROTOCOL_LIST_TERM,
};

/* Function to read the latest lines from a log file */
static void
read_log_file(const char *logfile, off_t *file_size)
{
  /* Open the file in read-only mode */
  int fd = open(logfile, O_RDONLY);
  if (fd < 0) {
    perror("Failed to open log file");
    return;
  }

  /* Get the current file status */
  struct stat st;
  if (fstat(fd, &st) < 0) {
    perror("Failed to get file status");
    close(fd);
    return;
  }

  /* Only read if the file has grown */
  if (st.st_size > *file_size) {
    /* Seek to the last known position */
    if (lseek(fd, *file_size, SEEK_SET) < 0) {
      perror("Failed to seek in log file");
      close(fd);
      return;
    }

    /* Read the log file incrementally */
    FILE *fp = fdopen(fd, "r");
    if (!fp) {
      perror("Failed to create file stream");
      close(fd);
      return;
    }

    /* Buffer for reading lines */
    char line[512];

    /* Read new log lines */
    while (fgets(line, sizeof(line), fp) != NULL) {
      add_log_line(line); /* Add the new line to the log buffer */
    }

    /* Update the file size to the current size after reading */
    *file_size = ftell(fp);

    /* Close the file stream */
    fclose(fp);
  } else {
    close(fd);
  }
}

/* Function to handle log file monitoring and rotation */
static void *
log_stream(void *arg)
{
  (void)arg;
  int fd = inotify_init();
  if (fd < 0) {
    perror("inotify_init");
    exit(EXIT_FAILURE);
  }

  /* This variable stores the file sizes for each log file */
  off_t file_sizes[MAX_LOG_LINES] = { 0 };

  int wd = inotify_add_watch(fd, LOG_DIR, IN_MODIFY | IN_CREATE | IN_MOVE);
  if (wd < 0) {
    perror("inotify_add_watch");
    close(fd);
    exit(EXIT_FAILURE);
  }

  char buffer[BUFFER_SIZE];
  while (!terminate) {
    int length = read(fd, buffer, BUFFER_SIZE);
    if (length < 0) {
      perror("read");
      close(fd);
      exit(EXIT_FAILURE);
    }

    int i = 0;
    while (i < length) {
      struct inotify_event *event = (struct inotify_event *)&buffer[i];
      if (event->len) {
        if (event->mask & IN_MODIFY) {
          /* Log file modified, read the new content */
          printf("Log file modified: %s\n", event->name);
          char filepath[256];
          snprintf(filepath, sizeof(filepath), "%s/%s", LOG_DIR, event->name);

          /* Read the log file from the stored size */
          read_log_file(filepath, &file_sizes[log_index % MAX_LOG_LINES]);
        } else if (event->mask & IN_MOVE) {
          /* Log file rotated */
          printf("Log file rotated: %s\n", event->name);
          /* Reset file size on rotation */
          file_sizes[log_index % MAX_LOG_LINES] = 0;
        }
      }
      i += sizeof(struct inotify_event) + event->len;
    }
  }

  inotify_rm_watch(fd, wd);
  close(fd);
  return NULL;
}

/* Signal handler for termination */
static void
handle_sigterm(int signo)
{
  (void)signo;
  terminate = true;
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

  struct lws_context_creation_info info;
  struct lws_context *context;
  pthread_t log_thread;

  /* Set up WebSocket server */
  memset(&info, 0, sizeof(info));
  info.port = WS_PORT;
  info.protocols = protocols;

  /* Set log level to error and warning only */
  lws_set_log_level(LLL_ERR | LLL_WARN, NULL);

  context = lws_create_context(&info);
  if (context == NULL) {
    fprintf(stderr, "lws_create_context failed\n");
    return -1;
  }

  /* Start the log monitoring thread */
  pthread_create(&log_thread, NULL, log_stream, NULL);

  /* Main event loop for WebSocket */
  while (!terminate) {
    lws_service(context, 1000); /* Process WebSocket events */
    /* Notify all clients that there are writable events */
    lws_callback_on_writable_all_protocol(context, &protocols[0]);
  }

  lws_context_destroy(context);
  pthread_join(log_thread, NULL);

  return 0;
}
