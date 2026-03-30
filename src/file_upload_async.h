#pragma once

#include <stdbool.h>
#include <stddef.h>

#include <glib.h>

#include "file_upload.h"

enum file_upload_async_operation {
  FILE_UPLOAD_ASYNC_OP_BEGIN = 0,
  FILE_UPLOAD_ASYNC_OP_APPEND_CHUNK,
  FILE_UPLOAD_ASYNC_OP_FINISH,
};

enum file_upload_async_submit_status {
  FILE_UPLOAD_ASYNC_SUBMIT_OK = 0,
  FILE_UPLOAD_ASYNC_SUBMIT_BUSY,
  FILE_UPLOAD_ASYNC_SUBMIT_CLOSED,
  FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY,
};

/* Completion payload delivered back on the GLib main context.
 *
 * Success cases:
 * - BEGIN: succeeded is true and overwritten/expected_size_bytes are valid
 * - APPEND_CHUNK: succeeded is true and written_size_bytes is valid
 * - FINISH: succeeded is true and result contains the final upload metadata
 *
 * Failure cases:
 * - succeeded is false
 * - result contains the structured error fields from file_upload.c
 */
struct file_upload_async_completion {
  enum file_upload_async_operation operation;
  bool succeeded;
  bool overwritten;
  size_t expected_size_bytes;
  size_t written_size_bytes;
  struct file_upload_result result;
};

struct file_upload_async;

typedef void (*file_upload_async_completion_cb)(const struct file_upload_async_completion *completion, void *user_data);

/* Create one connection-scoped async upload helper.
 *
 * All completion callbacks are invoked on main_context, which must be the
 * GLib context that owns the websocket/server state.
 */
struct file_upload_async *
file_upload_async_new(GMainContext *main_context, file_upload_async_completion_cb completion_cb, void *user_data);

/* Reference counting for async upload helpers shared with worker tasks. */
struct file_upload_async *file_upload_async_ref(struct file_upload_async *upload);
void file_upload_async_unref(struct file_upload_async *upload);

/* Stop delivering completions to the owner and clean up any active upload.
 *
 * If a background task is already running, cleanup is deferred until it
 * finishes so the worker never races the upload state.
 */
void file_upload_async_close(struct file_upload_async *upload);

/* Abort the current upload session.
 *
 * When a background task is current, the abort is deferred until that task
 * completes. Otherwise the temporary upload file is removed immediately.
 */
void file_upload_async_abort(struct file_upload_async *upload);

/* Submit one upload operation for background execution.
 *
 * Only one operation may be current per async upload helper. If the caller
 * submits a second operation before the previous completion callback ran, the
 * helper reports FILE_UPLOAD_ASYNC_SUBMIT_BUSY.
 */
enum file_upload_async_submit_status file_upload_async_submit_begin(struct file_upload_async *upload,
                                                                    const char *filename,
                                                                    size_t filename_len,
                                                                    size_t expected_size_bytes);

enum file_upload_async_submit_status
file_upload_async_submit_chunk(struct file_upload_async *upload, const char *content_b64, size_t content_b64_len);

enum file_upload_async_submit_status file_upload_async_submit_finish(struct file_upload_async *upload);

/* Stop the shared worker pool during websocket server shutdown. */
void file_upload_async_shutdown(void);
