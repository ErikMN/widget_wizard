/* log_stream.c
 *
 * Live log line streaming subsystem.
 *
 * Uses Linux inotify (via a GLib GIOChannel) to watch a syslog file and push
 * each new complete line to every subscribed WebSocket session.  No subprocess
 * is spawned; the file is read directly with standard stdio.
 *
 * Lifecycle:
 * - The inotify watch is started when the first client sends
 *   { "log_stream": true } and stopped when the last subscriber
 *   disconnects or unsubscribes.
 * - Log rotation: when the watched directory reports that the log file was
 *   deleted or moved away, the FILE* handle is closed.  When a new file with
 *   the same name appears (IN_CREATE / IN_MOVED_TO), it is opened from the
 *   beginning.
 * - Lines longer than MAX_LOG_LINE_LENGTH have the oversized portion skipped;
 *   the file position is advanced past the partial read on the next event so
 *   subsequent lines are not blocked.
 * - On subscribe, the last LOG_STREAM_HISTORY_BYTES of the current log file
 *   are replayed to the new subscriber only.  NOTE: a subsequent subscriber
 *   subscribing before the GLib main loop returns sees history starting from
 *   wherever the first subscriber's replay left the file pointer: the history
 *   window may be shorter, but no lines are lost.
 *
 * To change the monitored file, edit LOG_STREAM_FILE below.
 */

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <syslog.h>
#include <unistd.h>

#include <sys/inotify.h>

#include <glib.h>
#include <libwebsockets.h>
#include <jansson.h>

#include "json_out.h"
#include "log_stream.h"
#include "session.h"
#include "ws_limits.h"

/* -------------------------------------------------------------------------- */

/* Log file to monitor.  Must be readable by the application user. */
#define LOG_STREAM_FILE "/var/log/debug.log"

/* Parent directory of LOG_STREAM_FILE (watched for rotation events). */
#define LOG_STREAM_DIR "/var/log"

/* Bare filename component of LOG_STREAM_FILE. */
#define LOG_STREAM_FILENAME "debug.log"

/* How far from the end of file to seek when replaying history to a new
 * subscriber.  Gives roughly 50–100 typical syslog lines. */
#define LOG_STREAM_HISTORY_BYTES 8192

/* -------------------------------------------------------------------------- */

static int inotify_fd = -1;
static GIOChannel *inotify_chan = NULL;
static guint inotify_watch_id = 0;
static int inotify_dir_wd = -1;

static FILE *log_fp = NULL;
static GSList *log_subscribers = NULL;

/* -------------------------------------------------------------------------- */

/* Allocate a pending_ws_message and enqueue it on pss's transmit queue. */
static void
queue_line_to_session(struct per_session_data *pss, const char *line, size_t line_len)
{
  char json_buf[LWS_PRE + MAX_LOG_LINE_LENGTH + 64];
  bool truncated = false;
  size_t json_len = build_log_line_json(json_buf + LWS_PRE, sizeof(json_buf) - LWS_PRE, line, line_len, &truncated);

  if (json_len == 0 || truncated) {
    return;
  }

  struct pending_ws_message *msg = g_malloc(sizeof(*msg) + LWS_PRE + json_len);
  if (!msg) {
    return;
  }

  msg->len = json_len;
  memcpy(&msg->buf[LWS_PRE], json_buf + LWS_PRE, json_len);

  if (!pss->pending_tx_queue) {
    pss->pending_tx_queue = g_queue_new();
  }
  if (!pss->pending_tx_queue) {
    g_free(msg);
    return;
  }

  g_queue_push_tail(pss->pending_tx_queue, msg);
  if (pss->wsi) {
    lws_callback_on_writable(pss->wsi);
  }
}

/*
 * Read all newly available complete lines from log_fp.
 *
 * If target != NULL, send each line only to that session (history replay).
 * If target == NULL, broadcast to every subscriber.
 *
 * Incomplete lines at EOF (no trailing '\n') have the partial chunk skipped:
 * the file position is advanced past the partial read so subsequent lines are
 * not blocked.  The remainder is picked up after the next IN_MODIFY event.
 */
static void
read_new_lines(struct per_session_data *target)
{
  if (!log_fp) {
    return;
  }

  clearerr(log_fp);

  char linebuf[MAX_LOG_LINE_LENGTH + 1];

  while (true) {
    long pos = ftell(log_fp);
    if (!fgets(linebuf, (int)sizeof(linebuf), log_fp)) {
      break;
    }

    size_t len = strlen(linebuf);
    if (len == 0) {
      continue;
    }

    /* No newline at end: partial/oversized line (EOF mid-write or line longer
     * than linebuf).  Advance past this chunk so we do not loop on the same
     * position forever.  For a mid-write partial line this moves us slightly
     * beyond EOF; clearerr() at the top of the next call resets the flag so
     * the remainder is picked up after the next IN_MODIFY event. */
    if (linebuf[len - 1] != '\n') {
      fseek(log_fp, pos + (long)len, SEEK_SET);
      break;
    }

    /* Strip trailing \n and optional \r */
    linebuf[--len] = '\0';
    if (len > 0 && linebuf[len - 1] == '\r') {
      linebuf[--len] = '\0';
    }

    if (len == 0) {
      continue;
    }

    if (target) {
      queue_line_to_session(target, linebuf, len);
    } else {
      for (GSList *node = log_subscribers; node; node = node->next) {
        struct per_session_data *pss = node->data;
        if (pss && pss->wsi) {
          queue_line_to_session(pss, linebuf, len);
        }
      }
    }
  }
}

/*
 * Seek to LOG_STREAM_HISTORY_BYTES before EOF, skip to the next complete line
 * boundary, then replay those history lines to pss only.
 *
 * After this call log_fp is positioned at the current EOF, which is the
 * correct starting point for subsequent live broadcasts.
 */
static void
send_history_to_one(struct per_session_data *pss)
{
  if (!log_fp || !pss) {
    return;
  }

  if (fseek(log_fp, -(long)LOG_STREAM_HISTORY_BYTES, SEEK_END) != 0) {
    /* File smaller than history window: start from the beginning */
    rewind(log_fp);
  }

  /* Skip forward to the next complete line boundary so we never send a
   * partial first line. */
  int c;
  while ((c = fgetc(log_fp)) != EOF && c != '\n') { }

  /* Replay lines to this subscriber only */
  read_new_lines(pss);
  /* log_fp is now at current EOF - the correct position for live reads */
}

/* -------------------------------------------------------------------------- */

static void
open_log_file(void)
{
  if (log_fp) {
    fclose(log_fp);
    log_fp = NULL;
  }

  log_fp = fopen(LOG_STREAM_FILE, "r");
  if (!log_fp) {
    syslog(LOG_WARNING, "log_stream: cannot open %s: %m", LOG_STREAM_FILE);
  }
}

static void
close_log_file(void)
{
  if (log_fp) {
    fclose(log_fp);
    log_fp = NULL;
  }
}

/* -------------------------------------------------------------------------- */

/*
 * GLib IO watch callback - fires whenever the inotify fd has events to read.
 *
 * We watch the parent directory (LOG_STREAM_DIR) for:
 *   IN_MODIFY    - a write to the log file: read new lines and broadcast
 *   IN_CREATE    - new file at the log path (after rotation): reopen
 *   IN_MOVED_TO  - file moved into place (some rotation styles): reopen
 *   IN_DELETE    - log file deleted: close handle
 */
static gboolean
on_inotify_event(GIOChannel *source, GIOCondition condition, gpointer user_data)
{
  (void)source;
  (void)user_data;

  if (condition & (G_IO_HUP | G_IO_ERR)) {
    syslog(LOG_WARNING, "log_stream: inotify channel error");
    /* Clear state so start_log_monitor() can be called again if a new
     * subscriber arrives.  The watch source is already being removed by
     * GLib so we only need to drop the channel reference and reset the
     * tracking variables. */
    inotify_watch_id = 0;
    if (inotify_chan) {
      g_io_channel_unref(inotify_chan); /* also closes inotify_fd */
      inotify_chan = NULL;
      inotify_fd = -1;
    }
    inotify_dir_wd = -1;
    close_log_file();
    return G_SOURCE_REMOVE;
  }

  /* inotify events are variable-length; read as many as fit in buf */
  char buf[4096] __attribute__((aligned(__alignof__(struct inotify_event))));
  ssize_t n;

  while ((n = read(inotify_fd, buf, sizeof(buf))) > 0) {
    char *p = buf;
    while (p < buf + n) {
      const struct inotify_event *ev = (const struct inotify_event *)p;

      /* Only care about events for our specific log file */
      if (ev->len > 0 && strcmp(ev->name, LOG_STREAM_FILENAME) == 0) {
        if (ev->mask & IN_MODIFY) {
          read_new_lines(NULL);
        } else if (ev->mask & (IN_CREATE | IN_MOVED_TO)) {
          /* New file appeared after rotation */
          close_log_file();
          open_log_file();
          read_new_lines(NULL);
        } else if (ev->mask & IN_DELETE) {
          /* File deleted; close handle until a new one appears */
          close_log_file();
        }
      }

      p += (ssize_t)(sizeof(struct inotify_event) + ev->len);
    }
  }

  if (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
    syslog(LOG_WARNING, "log_stream: inotify read error: %m");
  }

  return G_SOURCE_CONTINUE;
}

/* -------------------------------------------------------------------------- */

static void
start_log_monitor(void)
{
  if (inotify_fd >= 0) {
    return; /* already running */
  }

  inotify_fd = inotify_init1(IN_NONBLOCK);
  if (inotify_fd < 0) {
    syslog(LOG_ERR, "log_stream: inotify_init1 failed: %m");
    return;
  }

  inotify_dir_wd = inotify_add_watch(inotify_fd, LOG_STREAM_DIR, IN_MODIFY | IN_CREATE | IN_MOVED_TO | IN_DELETE);
  if (inotify_dir_wd < 0) {
    syslog(LOG_ERR, "log_stream: inotify_add_watch failed: %m");
    close(inotify_fd);
    inotify_fd = -1;
    return;
  }

  inotify_chan = g_io_channel_unix_new(inotify_fd);
  g_io_channel_set_close_on_unref(inotify_chan, TRUE);
  g_io_channel_set_encoding(inotify_chan, NULL, NULL); /* binary mode */

  inotify_watch_id = g_io_add_watch(inotify_chan, G_IO_IN | G_IO_HUP | G_IO_ERR, on_inotify_event, NULL);

  open_log_file();
  syslog(LOG_INFO, "log_stream: monitoring %s via inotify", LOG_STREAM_FILE);
}

static void
stop_log_monitor(void)
{
  if (inotify_watch_id == 0 && inotify_fd < 0) {
    return; /* was never successfully started */
  }

  if (inotify_watch_id != 0) {
    g_source_remove(inotify_watch_id);
    inotify_watch_id = 0;
  }

  if (inotify_chan) {
    /* set_close_on_unref is TRUE, so this also closes inotify_fd */
    g_io_channel_unref(inotify_chan);
    inotify_chan = NULL;
    inotify_fd = -1;
  }

  inotify_dir_wd = -1;
  close_log_file();
  syslog(LOG_INFO, "log_stream: monitoring stopped");
}

/* -------------------------------------------------------------------------- */

bool
log_stream_handle_request(struct per_session_data *pss, json_t *root)
{
  json_t *req = json_object_get(root, "log_stream");
  if (!req) {
    return false;
  }

  if (!json_is_boolean(req)) {
    return true; /* key recognized, value ignored */
  }

  if (json_is_true(req)) {
    /* Idempotent: ignore if already subscribed */
    if (g_slist_find(log_subscribers, pss)) {
      return true;
    }

    if (inotify_fd < 0) {
      start_log_monitor();
    }

    /* Replay history before adding to the live subscriber list so that any
     * inotify event firing during replay goes only to existing subscribers. */
    send_history_to_one(pss);

    log_subscribers = g_slist_prepend(log_subscribers, pss);
    syslog(LOG_INFO, "log_stream: client subscribed (%u active)", g_slist_length(log_subscribers));
  } else {
    log_stream_unsubscribe(pss);
  }

  return true;
}

void
log_stream_unsubscribe(struct per_session_data *pss)
{
  if (!pss || !g_slist_find(log_subscribers, pss)) {
    return;
  }

  log_subscribers = g_slist_remove(log_subscribers, pss);
  syslog(LOG_INFO, "log_stream: client unsubscribed (%u active)", g_slist_length(log_subscribers));

  if (!log_subscribers) {
    stop_log_monitor();
  }
}

void
log_stream_stop(void)
{
  stop_log_monitor();
  g_slist_free(log_subscribers);
  log_subscribers = NULL;
}
