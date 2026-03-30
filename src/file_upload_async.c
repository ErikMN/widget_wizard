#include <string.h>

#include "file_upload_async.h"

/* One background worker thread is enough to keep upload decode/write work off
 * the websocket main loop without turning the upload path into an aggressive
 * parallel file writer on small devices.
 */
#define FILE_UPLOAD_ASYNC_WORKER_THREADS 1

struct file_upload_async {
  gint ref_count;
  GMainContext *main_context;
  file_upload_async_completion_cb completion_cb;
  void *user_data;
  GMutex lock;
  bool busy;
  bool closed;
  bool abort_requested;
  struct file_upload_state state;
};

struct file_upload_async_task {
  struct file_upload_async *upload;
  enum file_upload_async_operation operation;
  size_t expected_size_bytes;
  char *text;
  size_t text_len;
};

struct file_upload_async_dispatch {
  struct file_upload_async *upload;
  struct file_upload_async_completion completion;
};

static GMutex upload_worker_pool_lock;
static GThreadPool *upload_worker_pool = NULL;

static void run_upload_async_task(gpointer data, gpointer user_data);
struct file_upload_async *file_upload_async_ref(struct file_upload_async *upload);
void file_upload_async_unref(struct file_upload_async *upload);

/******************************************************************************/

/* Create the shared upload worker pool on first use. */
static bool
ensure_upload_worker_pool(void)
{
  GError *error = NULL;

  g_mutex_lock(&upload_worker_pool_lock);
  if (!upload_worker_pool) {
    upload_worker_pool =
        g_thread_pool_new(run_upload_async_task, NULL, FILE_UPLOAD_ASYNC_WORKER_THREADS, FALSE, &error);
  }
  g_mutex_unlock(&upload_worker_pool_lock);

  if (error) {
    g_error_free(error);
    return false;
  }

  return upload_worker_pool != NULL;
}

/* Release one async helper after its last owner drops the reference. */
static void
file_upload_async_free(struct file_upload_async *upload)
{
  if (!upload) {
    return;
  }

  file_upload_abort(&upload->state);
  g_mutex_clear(&upload->lock);
  g_main_context_unref(upload->main_context);
  g_free(upload);
}

/* Copy one possibly non-NUL-terminated string into heap storage. */
static char *
dup_string_field(const char *src, size_t src_len)
{
  char *dup = g_malloc(src_len + 1);
  if (!dup) {
    return NULL;
  }
  if (!src) {
    dup[0] = '\0';
    return dup;
  }
  if (src_len > 0) {
    memcpy(dup, src, src_len);
  }
  dup[src_len] = '\0';
  return dup;
}

/* Finalize one worker completion back on the owning GLib main context. */
static gboolean
deliver_async_completion(gpointer user_data)
{
  struct file_upload_async_dispatch *dispatch = user_data;
  struct file_upload_async *upload = dispatch->upload;
  file_upload_async_completion_cb completion_cb = NULL;
  void *completion_user_data = NULL;

  g_mutex_lock(&upload->lock);
  upload->busy = false;
  if (!upload->closed) {
    completion_cb = upload->completion_cb;
    completion_user_data = upload->user_data;
  }
  g_mutex_unlock(&upload->lock);

  if (completion_cb) {
    completion_cb(&dispatch->completion, completion_user_data);
  }

  file_upload_async_unref(upload);
  g_free(dispatch);
  return G_SOURCE_REMOVE;
}

/* Run one upload operation in the background worker thread. */
static void
run_upload_async_task(gpointer data, gpointer user_data)
{
  struct file_upload_async_task *task = data;
  struct file_upload_async_dispatch *dispatch = g_new0(struct file_upload_async_dispatch, 1);
  struct file_upload_async *upload = task->upload;

  (void)user_data;

  if (!dispatch) {
    g_mutex_lock(&upload->lock);
    upload->busy = false;
    if (upload->state.active) {
      file_upload_abort(&upload->state);
    }
    g_mutex_unlock(&upload->lock);
    file_upload_async_unref(upload);
    g_free(task->text);
    g_free(task);
    return;
  }

  dispatch->upload = upload;
  dispatch->completion.operation = task->operation;
  dispatch->completion.succeeded = false;

  g_mutex_lock(&upload->lock);
  switch (task->operation) {
  case FILE_UPLOAD_ASYNC_OP_BEGIN:
    dispatch->completion.succeeded = file_upload_begin(
        &upload->state, task->text, task->text_len, task->expected_size_bytes, &dispatch->completion.result);
    dispatch->completion.overwritten = upload->state.overwritten;
    dispatch->completion.expected_size_bytes = upload->state.expected_size_bytes;
    dispatch->completion.written_size_bytes = upload->state.written_size_bytes;
    break;

  case FILE_UPLOAD_ASYNC_OP_APPEND_CHUNK:
    dispatch->completion.succeeded =
        file_upload_append_base64_chunk(&upload->state, task->text, task->text_len, &dispatch->completion.result);
    dispatch->completion.overwritten = upload->state.overwritten;
    dispatch->completion.expected_size_bytes = upload->state.expected_size_bytes;
    dispatch->completion.written_size_bytes = upload->state.written_size_bytes;
    break;

  case FILE_UPLOAD_ASYNC_OP_FINISH:
    file_upload_finish(&upload->state, &dispatch->completion.result);
    dispatch->completion.succeeded = dispatch->completion.result.ok;
    dispatch->completion.overwritten = dispatch->completion.result.overwritten;
    dispatch->completion.expected_size_bytes = dispatch->completion.result.size_bytes;
    dispatch->completion.written_size_bytes = dispatch->completion.result.size_bytes;
    break;
  }

  if (upload->abort_requested) {
    if (upload->state.active) {
      file_upload_abort(&upload->state);
    }
    upload->abort_requested = false;
  }
  g_mutex_unlock(&upload->lock);

  g_main_context_invoke(upload->main_context, deliver_async_completion, dispatch);
  g_free(task->text);
  g_free(task);
}

/* Queue one prepared worker task onto the shared upload thread pool. */
static enum file_upload_async_submit_status
submit_async_task(struct file_upload_async *upload, struct file_upload_async_task *task)
{
  GError *error = NULL;
  gboolean queued = FALSE;

  if (!upload || !task) {
    g_free(task);
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }
  if (!ensure_upload_worker_pool()) {
    g_free(task->text);
    g_free(task);
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }

  g_mutex_lock(&upload->lock);
  if (upload->closed) {
    g_mutex_unlock(&upload->lock);
    g_free(task->text);
    g_free(task);
    return FILE_UPLOAD_ASYNC_SUBMIT_CLOSED;
  }
  if (upload->busy) {
    g_mutex_unlock(&upload->lock);
    g_free(task->text);
    g_free(task);
    return FILE_UPLOAD_ASYNC_SUBMIT_BUSY;
  }

  upload->busy = true;
  task->upload = file_upload_async_ref(upload);
  g_mutex_unlock(&upload->lock);

  g_mutex_lock(&upload_worker_pool_lock);
  if (upload_worker_pool) {
    queued = g_thread_pool_push(upload_worker_pool, task, &error);
  }
  g_mutex_unlock(&upload_worker_pool_lock);
  if (queued) {
    return FILE_UPLOAD_ASYNC_SUBMIT_OK;
  }

  if (error) {
    g_error_free(error);
  }

  /* Roll back the current-operation bookkeeping so the caller can handle the failure
   * without leaving the upload helper permanently busy.
   */
  g_mutex_lock(&upload->lock);
  upload->busy = false;
  g_mutex_unlock(&upload->lock);
  file_upload_async_unref(task->upload);
  g_free(task->text);
  g_free(task);
  return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
}

/******************************************************************************/

struct file_upload_async *
file_upload_async_new(GMainContext *main_context, file_upload_async_completion_cb completion_cb, void *user_data)
{
  struct file_upload_async *upload = g_new0(struct file_upload_async, 1);

  if (!upload) {
    return NULL;
  }

  upload->ref_count = 1;
  upload->main_context = g_main_context_ref(main_context ? main_context : g_main_context_default());
  upload->completion_cb = completion_cb;
  upload->user_data = user_data;
  g_mutex_init(&upload->lock);
  file_upload_reset_state(&upload->state);

  return upload;
}

struct file_upload_async *
file_upload_async_ref(struct file_upload_async *upload)
{
  if (!upload) {
    return NULL;
  }

  g_atomic_int_inc(&upload->ref_count);
  return upload;
}

void
file_upload_async_unref(struct file_upload_async *upload)
{
  if (!upload) {
    return;
  }

  if (g_atomic_int_dec_and_test(&upload->ref_count)) {
    file_upload_async_free(upload);
  }
}

void
file_upload_async_close(struct file_upload_async *upload)
{
  if (!upload) {
    return;
  }

  g_mutex_lock(&upload->lock);
  upload->closed = true;
  upload->completion_cb = NULL;
  upload->user_data = NULL;

  if (upload->busy) {
    upload->abort_requested = true;
  } else if (upload->state.active) {
    file_upload_abort(&upload->state);
  }
  g_mutex_unlock(&upload->lock);
}

void
file_upload_async_abort(struct file_upload_async *upload)
{
  if (!upload) {
    return;
  }

  g_mutex_lock(&upload->lock);
  if (upload->busy) {
    upload->abort_requested = true;
  } else if (upload->state.active) {
    file_upload_abort(&upload->state);
  }
  g_mutex_unlock(&upload->lock);
}

enum file_upload_async_submit_status
file_upload_async_submit_begin(struct file_upload_async *upload,
                               const char *filename,
                               size_t filename_len,
                               size_t expected_size_bytes)
{
  struct file_upload_async_task *task = g_new0(struct file_upload_async_task, 1);

  if (!task) {
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }

  task->operation = FILE_UPLOAD_ASYNC_OP_BEGIN;
  task->expected_size_bytes = expected_size_bytes;
  task->text_len = filename_len;
  task->text = dup_string_field(filename, filename_len);
  if (!task->text) {
    g_free(task);
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }

  return submit_async_task(upload, task);
}

enum file_upload_async_submit_status
file_upload_async_submit_chunk(struct file_upload_async *upload, const char *content_b64, size_t content_b64_len)
{
  struct file_upload_async_task *task = g_new0(struct file_upload_async_task, 1);

  if (!task) {
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }

  task->operation = FILE_UPLOAD_ASYNC_OP_APPEND_CHUNK;
  task->text_len = content_b64_len;
  task->text = dup_string_field(content_b64, content_b64_len);
  if (!task->text) {
    g_free(task);
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }

  return submit_async_task(upload, task);
}

enum file_upload_async_submit_status
file_upload_async_submit_finish(struct file_upload_async *upload)
{
  struct file_upload_async_task *task = g_new0(struct file_upload_async_task, 1);

  if (!task) {
    return FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY;
  }

  task->operation = FILE_UPLOAD_ASYNC_OP_FINISH;
  return submit_async_task(upload, task);
}

void
file_upload_async_shutdown(void)
{
  g_mutex_lock(&upload_worker_pool_lock);
  if (upload_worker_pool) {
    GThreadPool *pool = upload_worker_pool;
    upload_worker_pool = NULL;
    g_mutex_unlock(&upload_worker_pool_lock);
    g_thread_pool_free(pool, FALSE, TRUE);
    return;
  }
  g_mutex_unlock(&upload_worker_pool_lock);
}
