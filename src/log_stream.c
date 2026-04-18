/* log_stream.c
 *
 * Live log line streaming subsystem.
 *
 * Uses Linux inotify (via a GLib GIOChannel) to watch configured log files and push
 * each new complete line to every subscribed WebSocket session. No subprocess
 * is spawned. The files are read directly with standard stdio.
 *
 * Lifecycle:
 * - The inotify watch is started when the first client sends
 *   { "log_stream": true } and stopped when the last subscriber
 *   disconnects or unsubscribes.
 * - Log rotation: when the watched directory reports that the log file was
 *   deleted or moved away, the FILE* handle is closed. When a new file with
 *   the same name appears (IN_CREATE / IN_MOVED_TO), it is opened from the
 *   beginning. On write events the current FILE* inode is also compared with
 *   the path inode so rename-based rotation is detected reliably.
 * - Lines longer than MAX_LOG_LINE_LENGTH are not forwarded. Once a line is
 *   detected as oversized, its remainder is discarded up to the terminating
 *   newline, across as many inotify events as needed, so subsequent lines are
 *   not blocked.
 * - On subscribe, the last LOG_STREAM_HISTORY_BYTES of each watched log file are
 *   replayed to the new subscriber only using a separate FILE* per file, so
 *   the live file pointers are not disturbed.
 *
 * Limitations:
 * - Only the files listed in watched_filenames[] are monitored.
 * - File access is limited by the permissions of the user running this
 *   process. Files that cannot be opened are skipped.
 * - This subsystem is intended for lightweight live viewing, not for audit,
 *   forensics, or any use case that requires guaranteed complete log capture.
 * - New subscribers receive only a bounded tail of recent history, not the
 *   full contents of each log file.
 * - Oversized lines are dropped rather than truncated or reconstructed.
 * - History replay is file-local and follows watched_filenames[] order, not
 *   one global chronological merge across all watched files.
 *
 * Monitored files are listed in watched_filenames[] below.
 *
 * Call flow of the log streaming subsystem:
 *
 *   client sends { "log_stream": true }
 *     |
 *     v
 *   log_stream_handle_request()
 *     |
 *     v
 *   start_log_monitor() on first subscriber if the monitor is not already running
 *     |
 *     v
 *   send_history_to_one()
 *     |
 *     v
 *   subscriber added to log_subscribers
 *
 *   live write to watched file
 *     |
 *     v
 *   on_inotify_event()
 *     |
 *     v
 *   open_log_file() if needed
 *     |
 *     v
 *   read_new_lines()
 *     |
 *     v
 *   queue_line_to_session()
 *     |
 *     v
 *   libwebsockets write callback sends queued JSON
 *
 *   client sends { "log_stream": false } or disconnects
 *     |
 *     v
 *   log_stream_unsubscribe()
 *     |
 *     v
 *   stop_log_monitor() when last subscriber leaves
 */
#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <syslog.h>
#include <unistd.h>

#include <sys/inotify.h>
#include <sys/stat.h>

#include <glib.h>
#include <libwebsockets.h>
#include <jansson.h>

#include "json_out.h"
#include "log_stream.h"
#include "session.h"
#include "ws_limits.h"

/* -------------------------------------------------------------------------- */

/* Parent directory containing the log files to monitor. */
#define LOG_STREAM_DIR "/var/log"

/* How far from the end of each file to seek when replaying history to a new
 * subscriber. Gives roughly 50–100 typical syslog lines per file. */
#define LOG_STREAM_HISTORY_BYTES 8192

/* Maximum number of queued log messages per subscriber before the oldest
 * pending message is dropped to prevent unbounded memory growth. */
#define LOG_STREAM_MAX_PENDING_MESSAGES 1000

/*
 * Log files to monitor within LOG_STREAM_DIR.
 *
 * On this target syslog-ng routes each severity level to its own file rather
 * than accumulating them, so all files must be watched to capture the full
 * log stream.  Add or remove entries here as needed.
 *
 * NOTE: auth.log and its rotated copies are owned root:root (mode 640) on
 * this target. If the application runs as a non-root user, open_log_file()
 * will fail with EACCES and auth.log will be silently skipped (a syslog
 * warning is emitted). Remove it from the list if that is undesirable.
 */

// clang-format off
static const char *const watched_filenames[] = {
  "auth.log",
  "debug.log",
  "info.log",
  "warning.log",
  "error.log",
};

/* Labels sent in the JSON "level" field, one per watched file.
 *
 * These values are configured source tags, not parsed syslog severities.
 * The frontend uses them for display and client-side filtering.
 */
static const char *const watched_levels[] = {
  "auth",
  "debug",
  "info",
  "warning",
  "error",
};
// clang-format on

/* Number of log files being monitored. */
#define WATCHED_FILE_COUNT (sizeof(watched_filenames) / sizeof(watched_filenames[0]))

/* -------------------------------------------------------------------------- */

static int inotify_fd = -1;
static GIOChannel *inotify_chan = NULL;
static guint inotify_watch_id = 0;
static int inotify_dir_wd = -1;

static FILE *log_fps[WATCHED_FILE_COUNT]; /* one handle per watched file */
static GSList *log_subscribers = NULL;

/* Track whether opening a file has already failed to avoid log spam. */
static bool log_open_failed[WATCHED_FILE_COUNT];

/* For each live watched file, tracks whether read_new_lines() is currently
 * discarding the remainder of an oversized line.
 *
 * Why this is needed:
 * - A chunk without '\n' can mean either:
 *   - a partial line at current EOF
 *   - a line longer than MAX_LOG_LINE_LENGTH
 * - If more data already exists beyond the current chunk, the line is known
 *   to be oversized and must be discarded until its terminating newline.
 * - That discard may span multiple inotify events, so the state must persist
 *   between calls.
 *
 * This state is reset whenever the live file is reopened, closed, or
 * truncated in place because the old oversized line context no longer applies.
 */
static bool live_dropping_oversized_line[WATCHED_FILE_COUNT];

/* -------------------------------------------------------------------------- */

static void start_log_monitor(void);

/* -------------------------------------------------------------------------- */

/* Write the absolute path for watched_filenames[idx] into path. */
static void
build_log_path(size_t idx, char *path, size_t path_size)
{
  snprintf(path, path_size, "%s/%s", LOG_STREAM_DIR, watched_filenames[idx]);
}

/*
 * Check whether the open handle for watched_filenames[idx] still refers to
 * the same inode as the path on disk, and handle truncation.
 *
 * Rotation detection (returns true: caller must reopen):
 * When logrotate renames the file away without generating IN_DELETE (e.g.
 * "mv syslog syslog.1"), the open FILE* would keep reading from the old
 * inode indefinitely. Comparing inodes on every write event catches this.
 * Also returns true if the path has disappeared or either stat call fails.
 *
 * Truncation handling (returns false, handled in place):
 * If the current file position is beyond the reported file size the file
 * was truncated in place. clearerr() + rewind() resets the handle to the
 * beginning, the caller does not need to reopen.
 */
static bool
log_file_replaced_or_truncated(size_t idx)
{
  FILE *fp = log_fps[idx];
  char path[256];
  struct stat path_st;
  struct stat fp_st;
  long pos;

  if (!fp) {
    return false;
  }

  build_log_path(idx, path, sizeof(path));

  if (stat(path, &path_st) != 0) {
    return true;
  }

  if (fstat(fileno(fp), &fp_st) != 0) {
    return true;
  }

  if (path_st.st_dev != fp_st.st_dev || path_st.st_ino != fp_st.st_ino) {
    return true;
  }

  pos = ftell(fp);
  if (pos >= 0 && (off_t)pos > path_st.st_size) {
    /* The file was truncated in place. Reset the stream position and clear
     * oversized-line discard state because any previously skipped line no
     * longer exists in the truncated file.
     */
    clearerr(fp);
    rewind(fp);
    live_dropping_oversized_line[idx] = false;
  }

  return false;
}

/* Build one JSON log message and enqueue it for transmission to pss.
 *
 * The outgoing message includes the log text and, when provided, the
 * configured per-file label in the JSON "level" field.
 *
 * To keep per-session memory bounded, the queue is capped at
 * LOG_STREAM_MAX_PENDING_MESSAGES and the oldest pending entry is dropped
 * when the cap is reached.
 */
static void
queue_line_to_session(struct per_session_data *pss, const char *line, size_t line_len, const char *level)
{
  char json_buf[LWS_PRE + MAX_LOG_LINE_LENGTH + 64];
  bool truncated = false;
  size_t json_len =
      build_log_line_json(json_buf + LWS_PRE, sizeof(json_buf) - LWS_PRE, line, line_len, level, &truncated);

  if (json_len == 0 || truncated) {
    return;
  }

  /* g_malloc allocates n_bytes bytes of memory. If n_bytes is 0 it returns NULL.
   * If the allocation fails (because the system is out of memory), the program is terminated.
   * https://docs.gtk.org/glib/func.malloc.html
   * Therefore no need to check for NULL here.
   */
  struct pending_ws_message *msg = g_malloc(sizeof(*msg) + LWS_PRE + json_len);

  msg->len = json_len;
  memcpy(&msg->buf[LWS_PRE], json_buf + LWS_PRE, json_len);

  if (!pss->pending_tx_queue) {
    pss->pending_tx_queue = g_queue_new();
  }

  if (g_queue_get_length(pss->pending_tx_queue) >= LOG_STREAM_MAX_PENDING_MESSAGES) {
    struct pending_ws_message *oldest = g_queue_pop_head(pss->pending_tx_queue);
    if (oldest) {
      g_free(oldest);
    }
  }

  g_queue_push_tail(pss->pending_tx_queue, msg);
  if (pss->wsi) {
    lws_callback_on_writable(pss->wsi);
  }
}

/*
 * Read all newly available complete lines from fp.
 *
 * If target != NULL, send each line only to that session (history replay).
 * If target == NULL, broadcast to every subscriber.
 *
 * Line handling rules:
 * - A chunk ending with '\n' is a complete line and is forwarded.
 * - A chunk not ending with '\n' and read at current EOF is treated as a
 *   partial line. It is not forwarded, and the stream is rewound to the
 *   start of that read so the line can be retried when more data arrives.
 * - A chunk not ending with '\n' when more data already exists in the file
 *   proves that the line exceeds MAX_LOG_LINE_LENGTH. That line is not
 *   forwarded. Its remainder is discarded until the terminating newline is
 *   reached, across as many calls as needed.
 *
 * The caller owns the oversized-line discard state so live streaming and
 * history replay do not interfere with each other.
 */
static void
read_new_lines(FILE *fp, bool *dropping_oversized_line, struct per_session_data *target, const char *level)
{
  if (!fp || !dropping_oversized_line) {
    return;
  }

  clearerr(fp);

  /* Space for up to MAX_LOG_LINE_LENGTH bytes of content, plus '\n', plus NUL. */
  char linebuf[MAX_LOG_LINE_LENGTH + 2];

  while (true) {
    size_t len;
    if (*dropping_oversized_line) {
      /* A previous read already proved that this line is oversized.
       * Keep consuming and discarding chunks until its terminating newline
       * is reached. If EOF is hit first, stay in discard mode and continue
       * on the next event.
       */
      if (!fgets(linebuf, (int)sizeof(linebuf), fp)) {
        break;
      }
      len = strlen(linebuf);
      if (len > 0 && linebuf[len - 1] == '\n') {
        *dropping_oversized_line = false;
      }
      continue;
    }
    long pos = ftell(fp);
    if (!fgets(linebuf, (int)sizeof(linebuf), fp)) {
      break;
    }

    len = strlen(linebuf);
    if (len == 0) {
      continue;
    }
    if (linebuf[len - 1] != '\n') {
      /* No trailing newline means one of two things:
       * - This is a partial line at current EOF
       * - This line is longer than MAX_LOG_LINE_LENGTH
       *
       * feof() distinguishes those cases.
       */
      if (feof(fp)) {
        /* Partial line at EOF. Rewind so the same line can be retried after
         * more data arrives and can still be emitted intact.
         */
        clearerr(fp);
        if (pos >= 0) {
          fseek(fp, pos, SEEK_SET);
        }
        break;
      }
      /* More data already exists beyond this chunk, so the line is oversized.
       * Drop the whole line. Do not rewind, otherwise the same prefix would
       * be reread forever and later lines would be blocked.
       */
      *dropping_oversized_line = true;
      continue;
    }

    /* Strip trailing '\n' and optional '\r' */
    linebuf[--len] = '\0';
    if (len > 0 && linebuf[len - 1] == '\r') {
      linebuf[--len] = '\0';
    }

    if (len == 0) {
      continue;
    }

    if (target) {
      queue_line_to_session(target, linebuf, len, level);
    } else {
      for (GSList *node = log_subscribers; node; node = node->next) {
        struct per_session_data *pss = node->data;
        if (pss && pss->wsi) {
          queue_line_to_session(pss, linebuf, len, level);
        }
      }
    }
  }
}

/*
 * Replay the last LOG_STREAM_HISTORY_BYTES of every watched log file to pss.
 *
 * History is replayed file by file in watched_filenames[] order, not merged
 * into one global chronological stream.
 *
 * For each file: opens a separate FILE*, seeks backward when possible, skips
 * to the next complete line boundary only when starting in the middle, then
 * calls read_new_lines() to deliver the tail to pss only.
 */
static void
send_history_to_one(struct per_session_data *pss)
{
  if (!pss) {
    return;
  }

  for (size_t i = 0; i < WATCHED_FILE_COUNT; i++) {
    char path[256];
    FILE *fp;
    /* History replay uses its own discard state because it reads from a
     * separate temporary FILE*. It must not share live discard state.
     */
    bool dropping_oversized_line = false;

    build_log_path(i, path, sizeof(path));

    fp = fopen(path, "rb");
    if (!fp) {
      continue;
    }

    bool seeked_into_middle = (fseek(fp, -(long)LOG_STREAM_HISTORY_BYTES, SEEK_END) == 0);

    if (!seeked_into_middle) {
      /* File smaller than history window: start from the beginning */
      rewind(fp);
    }

    /* Skip to the next complete line boundary only if we started in the middle */
    if (seeked_into_middle) {
      int c;
      while ((c = fgetc(fp)) != EOF && c != '\n') { }
    }
    read_new_lines(fp, &dropping_oversized_line, pss, watched_levels[i]);
    fclose(fp);
  }
}

/* -------------------------------------------------------------------------- */

/*
 * Open (or reopen) the file at watched_filenames[idx] for reading.
 *
 * If seek_to_end is true, the file is positioned at EOF so only newly appended
 * lines are broadcast. If seek_to_end is false, the file is positioned at the
 * beginning so existing lines in a newly created replacement file can be read.
 *
 * Any previously open handle is closed first. Logs a warning on failure.
 */
static void
open_log_file(size_t idx, bool seek_to_end)
{
  char path[256];
  build_log_path(idx, path, sizeof(path));

  if (log_fps[idx]) {
    fclose(log_fps[idx]);
    log_fps[idx] = NULL;
  }

  live_dropping_oversized_line[idx] = false;

  log_fps[idx] = fopen(path, "rb");
  if (!log_fps[idx]) {
    if (!log_open_failed[idx]) {
      syslog(LOG_WARNING, "log_stream: cannot open %s: %m", path);
      log_open_failed[idx] = true;
    }
    return;
  }

  log_open_failed[idx] = false;

  if (seek_to_end) {
    if (fseek(log_fps[idx], 0, SEEK_END) != 0) {
      syslog(LOG_WARNING, "log_stream: cannot seek to end of %s: %m", path);
      fclose(log_fps[idx]);
      log_fps[idx] = NULL;
      return;
    }
  }
}

/* Close the handle for watched_filenames[idx] and set the slot to NULL. */
static void
close_log_file(size_t idx)
{
  if (log_fps[idx]) {
    fclose(log_fps[idx]);
    log_fps[idx] = NULL;
  }
  live_dropping_oversized_line[idx] = false;
}

/* Open all watched log files. Called once when monitoring starts. */
static void
open_all_log_files(void)
{
  for (size_t i = 0; i < WATCHED_FILE_COUNT; i++) {
    open_log_file(i, true);
  }
}

/* Close all open log file handles. Called on monitor stop or HUP. */
static void
close_all_log_files(void)
{
  for (size_t i = 0; i < WATCHED_FILE_COUNT; i++) {
    close_log_file(i);
  }
}

/* -------------------------------------------------------------------------- */

/* Return the index into watched_filenames[] matching name, or -1 if not watched. */
static int
find_watched_file(const char *name)
{
  for (size_t i = 0; i < WATCHED_FILE_COUNT; i++) {
    if (strcmp(name, watched_filenames[i]) == 0) {
      return (int)i;
    }
  }
  return -1;
}

/*
 * GLib IO watch callback - fires whenever the inotify fd has events to read.
 *
 * We watch the parent directory (LOG_STREAM_DIR) for:
 *   IN_MODIFY      - a write to the log file: read new lines and broadcast
 *   IN_CLOSE_WRITE - file closed after writing: read any final complete lines
 *   IN_CREATE      - new file at the log path (after rotation): reopen
 *   IN_MOVED_TO    - file moved into place (some rotation styles): reopen
 *   IN_DELETE      - log file deleted: close handle
 *   IN_MOVED_FROM  - log file moved away: close handle
 */
static gboolean
on_inotify_event(GIOChannel *source, GIOCondition condition, gpointer user_data)
{
  (void)source;
  (void)user_data;

  if (condition & (G_IO_HUP | G_IO_ERR)) {
    syslog(LOG_WARNING, "log_stream: inotify channel error");
    /* Clear state so start_log_monitor() can be called again if a new
     * subscriber arrives. The watch source is already being removed by
     * GLib so we only need to drop the channel reference and reset the
     * tracking variables.
     */
    inotify_watch_id = 0;
    if (inotify_chan) {
      g_io_channel_unref(inotify_chan); /* also closes inotify_fd */
      inotify_chan = NULL;
      inotify_fd = -1;
    }
    inotify_dir_wd = -1;
    close_all_log_files();
    /* If subscribers still exist, try to restore live streaming immediately.
     * If restart fails, drop the subscriber list so sessions are not left
     * subscribed to a monitor that no longer exists.
     */
    if (log_subscribers) {
      start_log_monitor();
      if (inotify_fd < 0 || inotify_watch_id == 0) {
        syslog(LOG_WARNING, "log_stream: monitor restart failed, dropping subscribers");
        g_slist_free(log_subscribers);
        log_subscribers = NULL;
      }
    }
    return G_SOURCE_REMOVE;
  }

  /* inotify events are variable-length; read as many as fit in buf */
  char buf[4096] __attribute__((aligned(__alignof__(struct inotify_event))));
  ssize_t n;

  while ((n = read(inotify_fd, buf, sizeof(buf))) > 0) {
    char *p = buf;
    while (p < buf + n) {
      const struct inotify_event *ev = (const struct inotify_event *)p;

      /* Dispatch to the matching watched file, if any */
      if (ev->len > 0) {
        int idx = find_watched_file(ev->name);
        if (idx >= 0) {
          if (ev->mask & (IN_DELETE | IN_MOVED_FROM)) {
            /* File deleted or moved away: close handle until a new one appears */
            close_log_file((size_t)idx);
          } else if (ev->mask & (IN_CREATE | IN_MOVED_TO)) {
            /* New file appeared after rotation: reopen from the start */
            close_log_file((size_t)idx);
            open_log_file((size_t)idx, false);
            read_new_lines(log_fps[idx], &live_dropping_oversized_line[idx], NULL, watched_levels[idx]);
          } else if (ev->mask & (IN_MODIFY | IN_CLOSE_WRITE)) {
            if (!log_fps[idx] || log_file_replaced_or_truncated((size_t)idx)) {
              open_log_file((size_t)idx, false);
            }
            read_new_lines(log_fps[idx], &live_dropping_oversized_line[idx], NULL, watched_levels[idx]);
          }
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

/*
 * Start the inotify directory monitor and open all watched log files.
 *
 * Creates an inotify instance, adds a watch on LOG_STREAM_DIR, wraps the fd
 * in a GLib GIOChannel, and registers on_inotify_event() with the GLib main
 * loop. Idempotent: returns immediately if the monitor is already running.
 */
static void
start_log_monitor(void)
{
  /* Already running */
  if (inotify_fd >= 0) {
    return;
  }

  inotify_fd = inotify_init1(IN_NONBLOCK);
  if (inotify_fd < 0) {
    syslog(LOG_ERR, "log_stream: inotify_init1 failed: %m");
    return;
  }

  inotify_dir_wd = inotify_add_watch(
      inotify_fd, LOG_STREAM_DIR, IN_MODIFY | IN_CLOSE_WRITE | IN_CREATE | IN_MOVED_TO | IN_DELETE | IN_MOVED_FROM);
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
  if (inotify_watch_id == 0) {
    syslog(LOG_ERR, "log_stream: g_io_add_watch failed");
    g_io_channel_unref(inotify_chan); /* also closes inotify_fd */
    inotify_chan = NULL;
    inotify_fd = -1;
    inotify_dir_wd = -1;
    return;
  }

  open_all_log_files();
  syslog(LOG_INFO, "log_stream: monitoring %zu file(s) in %s via inotify", WATCHED_FILE_COUNT, LOG_STREAM_DIR);
}

/*
 * Stop the inotify monitor, close all log file handles, and release all
 * associated resources. Safe to call if the monitor was never started.
 */
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
  close_all_log_files();
  syslog(LOG_INFO, "log_stream: monitoring stopped");
}

/* -------------------------------------------------------------------------- */

/* Replay history before adding to the live subscriber list so that any
 * inotify event firing during replay goes only to existing subscribers.
 * This avoids duplicate delivery during subscribe, at the cost of a small
 * gap where lines written during replay may not be seen by the new client.
 */
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

    if (inotify_fd < 0 || inotify_watch_id == 0) {
      start_log_monitor();
      if (inotify_fd < 0 || inotify_watch_id == 0) {
        syslog(LOG_WARNING, "log_stream: subscribe failed, monitor unavailable");
        return true;
      }
    }

    /* Replay history before adding to the live subscriber list so that any
     * inotify event firing during replay goes only to existing subscribers.
     */
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
