#include <syslog.h>
#include <string.h>

#include <jansson.h>
#include <libwebsockets.h>
#include <glib.h>

#include "session.h"
#include "file_upload_async.h"
#include "proc.h"
#include "json_out.h"
#include "ws_limits.h"
#include "ws_server.h"

/* Internal WebSocket server state (singleton instance).
 *
 * NOTE: This module supports exactly one WebSocket server per process.
 */
static struct {
  /* libwebsockets context */
  struct lws_context *ctx;
  /* Application state (not owned) */
  struct app_state *app;
  /* System statistics sampling timer */
  guint stats_timer_id;
  /* libwebsockets service timer */
  guint lws_timer_id;
} ws;

/******************************************************************************/

/* Connection accounting:
 *
 * - ws_pending_client_count is incremented in LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION.
 * - It is decremented either when the handshake completes
 *   (LWS_CALLBACK_ESTABLISHED) or when the connection is destroyed
 *   before establishment (LWS_CALLBACK_WSI_DESTROY).
 *
 * - ws_connected_client_count tracks fully established WebSocket
 *   connections only and is decremented in LWS_CALLBACK_CLOSED.
 *
 * This accounting is required because libwebsockets does not guarantee
 * that FILTER_PROTOCOL_CONNECTION is paired with ESTABLISHED or CLOSED
 * on all handshake failure paths.
 */
static unsigned int ws_pending_client_count = 0;
static unsigned int ws_connected_client_count = 0;
static unsigned int ws_streaming_client_count = 0;

static void set_stats_stream_enabled(struct lws *wsi, struct per_session_data *pss, bool enabled);

struct pending_ws_message {
  size_t len;
  unsigned char buf[];
};

/******************************************************************************/

/* Reset per-session process monitoring state to "disabled". */
static void
reset_process_monitoring(struct per_session_data *pss)
{
  if (!pss) {
    return;
  }

  pss->proc_enabled = false;
  pss->proc_name[0] = '\0';
  pss->prev_proc_utime = 0;
  pss->prev_proc_stime = 0;
  pss->prev_proc_sample_mono_ms = 0;
  pss->proc_pid = 0;
}

/* Release the per-session receive accumulator, if any. */
static void
free_receive_buffer(struct per_session_data *pss)
{
  if (!pss || !pss->recv_buf) {
    return;
  }

  g_byte_array_free(pss->recv_buf, TRUE);
  pss->recv_buf = NULL;
}

/* Release any queued one-shot responses for one websocket session. */
static void
free_pending_tx_queue(struct per_session_data *pss)
{
  if (!pss || !pss->pending_tx_queue) {
    return;
  }

  while (!g_queue_is_empty(pss->pending_tx_queue)) {
    g_free(g_queue_pop_head(pss->pending_tx_queue));
  }

  g_queue_free(pss->pending_tx_queue);
  pss->pending_tx_queue = NULL;
}

/* Queue one prebuilt JSON response for delivery from SERVER_WRITEABLE.
 *
 * The websocket helper paths may need to emit one-shot responses outside the
 * immediate receive callback, so replies are copied into a per-session queue
 * and flushed from the writable callback instead of writing inline.
 */
static void
queue_list_buffer_json(struct lws *wsi, struct per_session_data *pss, size_t out_len, const char *context)
{
  struct lws *target_wsi = wsi;
  struct pending_ws_message *pending = NULL;

  if (!pss || out_len == 0) {
    return;
  }

  if (!target_wsi) {
    target_wsi = pss->wsi;
  }
  if (!target_wsi) {
    syslog(LOG_WARNING, "%s: missing websocket handle for queued response", context);
    return;
  }

  if (!pss->pending_tx_queue) {
    pss->pending_tx_queue = g_queue_new();
    if (!pss->pending_tx_queue) {
      syslog(LOG_ERR, "%s: failed to allocate response queue", context);
      return;
    }
  }

  pending = g_malloc(sizeof(*pending) + LWS_PRE + out_len);
  if (!pending) {
    syslog(LOG_ERR, "%s: failed to allocate response buffer", context);
    return;
  }

  pending->len = out_len;
  memcpy(&pending->buf[LWS_PRE], &pss->list_buf[LWS_PRE], out_len);
  g_queue_push_tail(pss->pending_tx_queue, pending);
  lws_callback_on_writable(target_wsi);
}

/* Build and send a compact error response for one client command. */
static void
send_error_response(struct lws *wsi,
                    struct per_session_data *pss,
                    const char *type,
                    const char *message,
                    const char *log_context)
{
  bool truncated = false;
  size_t out_len = build_error_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, type, message, &truncated);

  if (out_len > 0) {
    queue_list_buffer_json(wsi, pss, out_len, log_context);
  }
  if (truncated) {
    syslog(LOG_WARNING, "%s truncated to fit %u bytes", log_context, MAX_LIST_JSON_LENGTH);
  }
}

/* Build and send the final upload success/error response for one client command. */
static void
send_upload_result_response(struct lws *wsi,
                            struct per_session_data *pss,
                            const struct file_upload_result *result,
                            const char *log_context)
{
  bool truncated = false;
  size_t out_len = build_upload_result_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, result, &truncated);

  if (out_len > 0) {
    queue_list_buffer_json(wsi, pss, out_len, log_context);
  }
  if (truncated) {
    syslog(LOG_WARNING, "%s truncated to fit %u bytes", log_context, MAX_LIST_JSON_LENGTH);
  }
}

/* Build and send one upload_begin acknowledgement. */
static void
send_upload_begin_response(struct lws *wsi, struct per_session_data *pss, bool overwritten, size_t size_bytes)
{
  bool truncated = false;
  size_t out_len = build_upload_begin_ack_json((char *)&pss->list_buf[LWS_PRE],
                                               MAX_LIST_JSON_LENGTH,
                                               overwritten,
                                               size_bytes,
                                               MAX_UPLOAD_CHUNK_SIZE_BYTES,
                                               &truncated);

  if (out_len > 0) {
    queue_list_buffer_json(wsi, pss, out_len, "Upload begin response");
  }
  if (truncated) {
    syslog(LOG_WARNING, "Upload begin response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
  }
}

/* Build and send one upload_chunk acknowledgement. */
static void
send_upload_chunk_response(struct lws *wsi, struct per_session_data *pss, size_t received_bytes)
{
  bool truncated = false;
  size_t out_len =
      build_upload_chunk_ack_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, received_bytes, &truncated);

  if (out_len > 0) {
    queue_list_buffer_json(wsi, pss, out_len, "Upload chunk response");
  }
  if (truncated) {
    syslog(LOG_WARNING, "Upload chunk response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
  }
}

/* Convert one async-upload submit failure into the websocket error style. */
static void
send_upload_submit_error(struct lws *wsi,
                         struct per_session_data *pss,
                         enum file_upload_async_submit_status submit_status,
                         const char *log_context)
{
  switch (submit_status) {
  case FILE_UPLOAD_ASYNC_SUBMIT_BUSY:
    send_error_response(wsi, pss, "upload_busy", "A previous upload operation is still being processed", log_context);
    return;

  case FILE_UPLOAD_ASYNC_SUBMIT_CLOSED:
    send_error_response(wsi, pss, "internal_error", "Upload connection is closing", log_context);
    return;

  case FILE_UPLOAD_ASYNC_SUBMIT_NO_MEMORY:
    send_error_response(wsi, pss, "internal_error", "Failed to schedule upload work", log_context);
    return;

  case FILE_UPLOAD_ASYNC_SUBMIT_OK:
    return;
  }
}

/* Deliver one async upload completion back into the websocket response flow.
 *
 * The worker thread only mutates upload state and posts this callback back to
 * the GLib main context. Actual websocket replies are still queued from the
 * main loop thread.
 */
static void
handle_upload_async_completion(const struct file_upload_async_completion *completion, void *user_data)
{
  struct per_session_data *pss = user_data;

  if (!completion || !pss) {
    return;
  }

  switch (completion->operation) {
  case FILE_UPLOAD_ASYNC_OP_BEGIN:
    if (completion->succeeded) {
      send_upload_begin_response(NULL, pss, completion->overwritten, completion->expected_size_bytes);
    } else {
      send_upload_result_response(NULL, pss, &completion->result, "Upload begin result");
    }
    return;

  case FILE_UPLOAD_ASYNC_OP_APPEND_CHUNK:
    if (completion->succeeded) {
      send_upload_chunk_response(NULL, pss, completion->written_size_bytes);
    } else {
      send_upload_result_response(NULL, pss, &completion->result, "Upload chunk result");
    }
    return;

  case FILE_UPLOAD_ASYNC_OP_FINISH:
    send_upload_result_response(NULL, pss, &completion->result, "Upload finish result");
    return;
  }
}

enum receive_append_status { RECEIVE_APPEND_OK = 0, RECEIVE_APPEND_TOO_LARGE, RECEIVE_APPEND_NO_MEMORY };

/* Append one receive fragment to the per-session message accumulator. */
static enum receive_append_status
append_receive_fragment(struct per_session_data *pss, const void *in, size_t len)
{
  if (!pss) {
    return RECEIVE_APPEND_NO_MEMORY;
  }

  if (!pss->recv_buf) {
    pss->recv_buf = g_byte_array_sized_new(
        (guint)MIN((size_t)MAX_SMALL_CONTROL_MESSAGE_LENGTH, (size_t)MAX_RECEIVE_MESSAGE_LENGTH));
    if (!pss->recv_buf) {
      return RECEIVE_APPEND_NO_MEMORY;
    }
  }

  if (len > (size_t)MAX_RECEIVE_MESSAGE_LENGTH - pss->recv_buf->len) {
    return RECEIVE_APPEND_TOO_LARGE;
  }

  g_byte_array_append(pss->recv_buf, in, (guint)len);
  return RECEIVE_APPEND_OK;
}

/* Handle explicit stats stream subscription control.
 *
 * Request format:
 *   { "stats_stream": true }
 *   { "stats_stream": false }
 *
 * Returns true if the command was recognized (successfully or not).
 */
static bool
handle_stats_stream_request(struct lws *wsi, struct per_session_data *pss, json_t *root)
{
  json_t *stream_req = json_object_get(root, "stats_stream");
  if (!stream_req) {
    return false;
  }

  if (!json_is_boolean(stream_req)) {
    send_error_response(
        wsi, pss, "invalid_stats_stream_request", "stats_stream must be a boolean", "Stats stream error response");
    return true;
  }

  set_stats_stream_enabled(wsi, pss, json_is_true(stream_req));
  return true;
}

/* Handle one upload_begin request.
 *
 * Request format:
 *   { "upload_begin": { "filename": "name.bin", "size_bytes": 12345 } }
 */
static bool
handle_upload_begin_request(struct lws *wsi, struct per_session_data *pss, json_t *root)
{
  json_t *upload_begin = json_object_get(root, "upload_begin");
  if (!upload_begin) {
    return false;
  }

  if (!json_is_object(upload_begin)) {
    send_error_response(wsi,
                        pss,
                        "invalid_upload_begin_request",
                        "upload_begin must be an object with filename and size_bytes",
                        "Upload begin error response");
    return true;
  }

  json_t *filename = json_object_get(upload_begin, "filename");
  json_t *size_bytes = json_object_get(upload_begin, "size_bytes");
  if (!json_is_string(filename) || !json_is_integer(size_bytes) || json_integer_value(size_bytes) < 0) {
    send_error_response(wsi,
                        pss,
                        "invalid_upload_begin_request",
                        "upload_begin must include string field 'filename' and non-negative integer field 'size_bytes'",
                        "Upload begin error response");
    return true;
  }

  if (!pss->upload_async) {
    send_error_response(wsi, pss, "internal_error", "Upload worker is unavailable", "Upload begin error response");
    return true;
  }

  enum file_upload_async_submit_status submit_status =
      file_upload_async_submit_begin(pss->upload_async,
                                     json_string_value(filename),
                                     json_string_length(filename),
                                     (size_t)json_integer_value(size_bytes));
  if (submit_status != FILE_UPLOAD_ASYNC_SUBMIT_OK) {
    send_upload_submit_error(wsi, pss, submit_status, "Upload begin submit error");
  }
  return true;
}

/* Handle one upload_chunk request.
 *
 * Request format:
 *   { "upload_chunk": { "content_b64": "..." } }
 */
static bool
handle_upload_chunk_request(struct lws *wsi, struct per_session_data *pss, json_t *root)
{
  json_t *upload_chunk = json_object_get(root, "upload_chunk");
  if (!upload_chunk) {
    return false;
  }

  if (!json_is_object(upload_chunk)) {
    file_upload_async_abort(pss->upload_async);
    send_error_response(wsi,
                        pss,
                        "invalid_upload_chunk_request",
                        "upload_chunk must be an object with content_b64",
                        "Upload chunk error response");
    return true;
  }

  json_t *content_b64 = json_object_get(upload_chunk, "content_b64");
  if (!json_is_string(content_b64)) {
    file_upload_async_abort(pss->upload_async);
    send_error_response(wsi,
                        pss,
                        "invalid_upload_chunk_request",
                        "upload_chunk must include string field 'content_b64'",
                        "Upload chunk error response");
    return true;
  }

  if (!pss->upload_async) {
    send_error_response(wsi, pss, "internal_error", "Upload worker is unavailable", "Upload chunk error response");
    return true;
  }

  enum file_upload_async_submit_status submit_status = file_upload_async_submit_chunk(
      pss->upload_async, json_string_value(content_b64), json_string_length(content_b64));
  if (submit_status != FILE_UPLOAD_ASYNC_SUBMIT_OK) {
    send_upload_submit_error(wsi, pss, submit_status, "Upload chunk submit error");
  }
  return true;
}

/* Handle one upload_finish request.
 *
 * Request format:
 *   { "upload_finish": true }
 */
static bool
handle_upload_finish_request(struct lws *wsi, struct per_session_data *pss, json_t *root)
{
  json_t *upload_finish = json_object_get(root, "upload_finish");
  if (!upload_finish) {
    return false;
  }

  if (!json_is_true(upload_finish)) {
    file_upload_async_abort(pss->upload_async);
    send_error_response(
        wsi, pss, "invalid_upload_finish_request", "upload_finish must be true", "Upload finish error response");
    return true;
  }

  if (!pss->upload_async) {
    send_error_response(wsi, pss, "internal_error", "Upload worker is unavailable", "Upload finish error response");
    return true;
  }

  enum file_upload_async_submit_status submit_status = file_upload_async_submit_finish(pss->upload_async);
  if (submit_status != FILE_UPLOAD_ASYNC_SUBMIT_OK) {
    send_upload_submit_error(wsi, pss, submit_status, "Upload finish submit error");
  }
  return true;
}

/* Handle one upload protocol request.
 *
 * Requests are split into explicit begin/chunk/finish messages so large files
 * do not require one giant JSON receive buffer per connection.
 */
static bool
handle_upload_request(struct lws *wsi, struct per_session_data *pss, json_t *root)
{
  if (handle_upload_begin_request(wsi, pss, root)) {
    return true;
  }
  if (handle_upload_chunk_request(wsi, pss, root)) {
    return true;
  }
  if (handle_upload_finish_request(wsi, pss, root)) {
    return true;
  }

  return false;
}

/* Parse and dispatch one complete client JSON message. */
static void
handle_client_message(struct lws *wsi, struct per_session_data *pss, const unsigned char *msg, size_t len)
{
  json_error_t json_error;
  json_t *root = json_loadb((const char *)msg, len, 0, &json_error);
  if (!root || !json_is_object(root)) {
    syslog(LOG_WARNING,
           "Invalid JSON received: %s (line %d, column %d)",
           json_error.text,
           json_error.line,
           json_error.column);
    if (root) {
      json_decref(root);
    }
    file_upload_async_abort(pss->upload_async);
    send_error_response(
        wsi, pss, "invalid_json", "Control message must be a valid JSON object", "Invalid JSON response");
    return;
  }

  /* One-shot process list request: { "list_processes": true }
   *
   * NOTE:
   * This triggers a full /proc scan to build a unique process list.
   * The operation may cause brief CPU spikes when repeatedly invoked,
   * which is acceptable as it is user-initiated and not performed
   * automatically or in the background.
   */
  json_t *list_processes = json_object_get(root, "list_processes");
  if (json_is_true(list_processes)) {
    bool truncated = false;
    size_t out_len = build_process_list_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, &truncated);
    if (out_len > 0) {
      queue_list_buffer_json(wsi, pss, out_len, "Process list response");
    }
    if (truncated) {
      syslog(LOG_INFO, "Process list response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
    }
    json_decref(root);
    return;
  }

  /* One-shot storage info request: { "storage": true } */
  json_t *storage_req = json_object_get(root, "storage");
  if (json_is_true(storage_req)) {
    bool truncated = false;
    size_t out_len = build_storage_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, &truncated);
    if (out_len > 0) {
      queue_list_buffer_json(wsi, pss, out_len, "Storage response");
    }
    if (truncated) {
      syslog(LOG_INFO, "Storage response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
    }
    json_decref(root);
    return;
  }

  /* One-shot system info request: { "system_info": true } */
  json_t *sysinfo_req = json_object_get(root, "system_info");
  if (json_is_true(sysinfo_req)) {
    bool truncated = false;
    size_t out_len = build_system_info_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, &truncated);

    if (out_len > 0) {
      queue_list_buffer_json(wsi, pss, out_len, "System info response");
    }
    if (truncated) {
      syslog(LOG_INFO, "System info response truncated");
    }
    json_decref(root);
    return;
  }

  if (handle_stats_stream_request(wsi, pss, root)) {
    json_decref(root);
    return;
  }

  if (handle_upload_request(wsi, pss, root)) {
    json_decref(root);
    return;
  }

  /* Expect JSON: { "monitor": "process_name" } */
  json_t *monitor = json_object_get(root, "monitor");
  if (!monitor) {
    json_decref(root);
    return;
  }

  /* Explicit stop-monitoring command: { "monitor": "" } */
  if (json_is_string(monitor) && json_string_length(monitor) == 0) {
    reset_process_monitoring(pss);
    syslog(LOG_INFO, "Client stopped process monitoring");
    json_decref(root);
    return;
  }

  /* Normal start-monitoring command */
  if (json_is_string(monitor)) {
    size_t proc_name_len = json_string_length(monitor);
    size_t copy_len = proc_name_len;
    if (copy_len >= sizeof(pss->proc_name)) {
      copy_len = sizeof(pss->proc_name) - 1;
    }

    memcpy(pss->proc_name, json_string_value(monitor), copy_len);
    pss->proc_name[copy_len] = '\0';
    pss->proc_enabled = true;
    pss->prev_proc_utime = 0;
    pss->prev_proc_stime = 0;
    pss->prev_proc_sample_mono_ms = 0;
    pss->proc_pid = 0;
    syslog(LOG_INFO, "Client monitoring process: %s", pss->proc_name);
  }

  json_decref(root);
}

/******************************************************************************/

/* Periodic GLib timer callback that updates the system statistics in app_state.
 *
 * This runs in the GLib main loop thread and refreshes app_state::stats.
 * The data is later consumed by the WebSocket write
 * callback when sending updates to connected clients.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
static gboolean
stats_timer_cb(gpointer user_data)
{
  struct app_state *app = user_data;

  stats_update_sys_stats(&app->stats);

  return G_SOURCE_CONTINUE;
}

/******************************************************************************/

/*
 * Statistics sampling timer:
 *
 * - The stats timer is started when the first client enables stats_stream.
 * - The stats timer is stopped when the last streaming client disables it
 *   or disconnects.
 *
 * Rationale:
 * - Avoid unnecessary /proc polling for one-shot-only clients.
 * - Sampling frequency is independent of WebSocket send frequency.
 */
static void
start_stats_timer(void)
{
  if (ws.stats_timer_id == 0 && ws.app) {
    ws.stats_timer_id = g_timeout_add(500, stats_timer_cb, ws.app);
  }
}

/* Stop the statistics sampling timer */
static void
stop_stats_timer(void)
{
  if (ws.stats_timer_id != 0) {
    g_source_remove(ws.stats_timer_id);
    ws.stats_timer_id = 0;
  }
}

/******************************************************************************/

/* Enable or disable periodic stats streaming for one WebSocket client.
 *
 * Streaming is opt-in per session. This helper keeps the per-session libwebsockets
 * timer and the shared GLib stats sampling timer in sync with the client's
 * current subscription state.
 */
static void
set_stats_stream_enabled(struct lws *wsi, struct per_session_data *pss, bool enabled)
{
  if (!wsi || !pss || pss->stats_stream_enabled == enabled) {
    return;
  }

  pss->stats_stream_enabled = enabled;

  if (enabled) {
    ws_streaming_client_count++;
    if (ws_streaming_client_count == 1) {
      start_stats_timer();
    }

    /* Refresh once immediately so the first subscribed frame is not stale after idle periods */
    if (ws.app) {
      stats_update_sys_stats(&ws.app->stats);
    }

    /* Send one snapshot immediately, then continue on the per-client timer */
    lws_callback_on_writable(wsi);
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
    syslog(LOG_INFO, "Client enabled stats streaming (%u active)", ws_streaming_client_count);
    return;
  }

  if (ws_streaming_client_count > 0) {
    ws_streaming_client_count--;
  }

  /* Stop future per-client periodic sends once streaming is disabled */
  lws_set_timer_usecs(wsi, LWS_SET_TIMER_USEC_CANCEL);
  if (ws_streaming_client_count == 0) {
    stop_stats_timer();
  }
  syslog(LOG_INFO, "Client disabled stats streaming (%u active)", ws_streaming_client_count);
}

/******************************************************************************/

/* WebSocket protocol callback
 *
 * - Server sends periodic JSON snapshots only to clients that enabled stats_stream.
 * - Update rate is approximately 500 ms per subscribed client.
 * - CPU usage is reported as a percentage [0.0 - 100.0].
 * - Memory values are reported in kilobytes.
 * - The first CPU value after stream enable may be 0.0 due to baseline initialization.
 * - Only allow MAX_WS_CONNECTED_CLIENTS concurrent connections.
 */
static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  switch (reason) {

  case LWS_CALLBACK_ESTABLISHED: {
    struct per_session_data *pss = user;
    if (!pss) {
      syslog(LOG_ERR, "LWS_CALLBACK_ESTABLISHED: missing per-session data");
      /* Abort the connection */
      return -1;
    }
    /* Convert one pending slot to active */
    if (ws_pending_client_count > 0) {
      ws_pending_client_count--;
    }

    ws_connected_client_count++;
    pss->counted = true;
    pss->wsi = wsi;
    pss->pending_tx_queue = NULL;
    pss->stats_stream_enabled = false;
    pss->upload_async = file_upload_async_new(g_main_context_default(), handle_upload_async_completion, pss);
    if (!pss->upload_async) {
      syslog(LOG_ERR, "LWS_CALLBACK_ESTABLISHED: failed to allocate upload worker state");
      return -1;
    }
    syslog(LOG_INFO, "WebSocket client connected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    break;
  }

  /*
   * Per-client send timer:
   *
   * Each WebSocket connection has its own libwebsockets timer that
   * controls how often data is sent to that client.
   *
   * This timer:
   * - Does NOT sample system statistics.
   * - Only schedules LWS_CALLBACK_SERVER_WRITEABLE.
   *
   * All subscribed clients observe the same latest_stats snapshot.
   */
  case LWS_CALLBACK_TIMER: {
    struct per_session_data *pss = user;

    if (!pss || !pss->stats_stream_enabled) {
      break;
    }

    /* Ask lws for a writeable callback */
    lws_callback_on_writable(wsi);
    /* Rearm timer for next tick */
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
    break;
  }

  case LWS_CALLBACK_RECEIVE: {
    /* Log received data */
    syslog(LOG_DEBUG, "WebSocket received %zu bytes", len);
    struct per_session_data *pss = user;

    if (!pss) {
      syslog(LOG_WARNING, "WebSocket receive: missing per-session data");
      break;
    }

    if (pss->discard_rx_message) {
      if (lws_is_final_fragment(wsi)) {
        pss->discard_rx_message = false;
      }
      break;
    }

    enum receive_append_status append_status = append_receive_fragment(pss, in, len);
    if (append_status == RECEIVE_APPEND_TOO_LARGE) {
      syslog(LOG_WARNING, "WebSocket receive: control message too large (limit %u bytes)", MAX_RECEIVE_MESSAGE_LENGTH);
      file_upload_async_abort(pss->upload_async);
      free_receive_buffer(pss);
      pss->discard_rx_message = !lws_is_final_fragment(wsi);
      send_error_response(wsi,
                          pss,
                          "control_message_too_large",
                          "Control message exceeds the configured size limit",
                          "Oversize control response");
      break;
    }
    if (append_status == RECEIVE_APPEND_NO_MEMORY) {
      syslog(LOG_ERR, "WebSocket receive: failed to allocate receive buffer");
      file_upload_async_abort(pss->upload_async);
      free_receive_buffer(pss);
      pss->discard_rx_message = !lws_is_final_fragment(wsi);
      send_error_response(
          wsi, pss, "internal_error", "Failed to allocate receive buffer", "Receive allocation error response");
      break;
    }

    if (!lws_is_final_fragment(wsi)) {
      break;
    }

    if (!pss->recv_buf || pss->recv_buf->len == 0) {
      syslog(LOG_WARNING, "WebSocket receive: empty message");
      free_receive_buffer(pss);
      break;
    }

    handle_client_message(wsi, pss, pss->recv_buf->data, pss->recv_buf->len);
    free_receive_buffer(pss);
    break;
  }

  case LWS_CALLBACK_CLOSED: {
    struct per_session_data *pss = user;

    if (pss) {
      pss->wsi = NULL;
    }
    if (pss && pss->stats_stream_enabled) {
      set_stats_stream_enabled(wsi, pss, false);
    }
    if (pss) {
      file_upload_async_close(pss->upload_async);
      file_upload_async_unref(pss->upload_async);
      pss->upload_async = NULL;
    }

    if (pss && pss->counted) {
      if (ws_connected_client_count > 0) {
        ws_connected_client_count--;
      }
    }
    free_pending_tx_queue(pss);
    free_receive_buffer(pss);
    syslog(LOG_INFO, "WebSocket client disconnected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    break;
  }

  case LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION: {
    /* Enforce connection limit across both established and in-progress WebSocket handshakes */
    if (ws_connected_client_count + ws_pending_client_count >= MAX_WS_CONNECTED_CLIENTS) {
      syslog(LOG_WARNING, "Rejecting WebSocket connection: client limit (%u) reached", MAX_WS_CONNECTED_CLIENTS);
      return -1;
    }

    /* Reserve a slot for this connection attempt */
    ws_pending_client_count++;

    break;
  }

  case LWS_CALLBACK_SERVER_WRITEABLE: {
    struct per_session_data *pss = user;
    struct pending_ws_message *pending = NULL;
    char json[MAX_WS_MESSAGE_LENGTH];
    int json_len;
    bool truncated = false;
    struct app_state *app = lws_context_user(lws_get_context(wsi));

    if (!pss) {
      break;
    }

    if (pss->pending_tx_queue && !g_queue_is_empty(pss->pending_tx_queue)) {
      pending = g_queue_pop_head(pss->pending_tx_queue);
      if (!pending) {
        break;
      }

      int written = lws_write(wsi, &pending->buf[LWS_PRE], pending->len, LWS_WRITE_TEXT);
      if (written < 0) {
        syslog(LOG_WARNING, "Queued response write failed");
      } else if ((size_t)written != pending->len) {
        syslog(LOG_WARNING, "Queued response short write: %d of %zu", written, pending->len);
      }
      g_free(pending);

      if (pss->pending_tx_queue && !g_queue_is_empty(pss->pending_tx_queue)) {
        lws_callback_on_writable(wsi);
      }
      break;
    }

    if (!pss->stats_stream_enabled) {
      break;
    }

    json_len = (int)build_stats_json(json,
                                     sizeof(json),
                                     &app->stats,
                                     proc_get_cpu_core_count(),
                                     ws_connected_client_count,
                                     MAX_WS_CONNECTED_CLIENTS,
                                     pss,
                                     &truncated);
    if (json_len <= 0 || truncated) {
      syslog(LOG_ERR, "JSON message truncated, dropping the frame");
      break;
    }

    /* Copy JSON to per-session buffer */
    memcpy(&pss->stream_buf[LWS_PRE], json, (size_t)json_len);

    /* Send one complete WS text message */
    int written = lws_write(wsi, &pss->stream_buf[LWS_PRE], (size_t)json_len, LWS_WRITE_TEXT);
    if (written < 0) {
      syslog(LOG_WARNING, "lws_write failed");
      break;
    }
    if (written != json_len) {
      /* Short write: do not attempt to send the remainder as a new TEXT frame */
      syslog(LOG_WARNING, "short write: %d of %d", written, json_len);
    }
    break;
  }

  case LWS_CALLBACK_WSI_DESTROY: {
    struct per_session_data *pss = user;
    /*
     * Handshake-failure cleanup:
     *
     * FILTER_PROTOCOL_CONNECTION is not guaranteed to be paired with
     * ESTABLISHED or CLOSED on all libwebsockets failure paths.
     *
     * If this session never reached ESTABLISHED, it still holds a
     * pending slot that must be released here.
     */
    if (pss && !pss->counted) {
      if (ws_pending_client_count > 0) {
        ws_pending_client_count--;
      }
    }
    if (pss) {
      pss->wsi = NULL;
    }
    if (pss) {
      file_upload_async_close(pss->upload_async);
      file_upload_async_unref(pss->upload_async);
      pss->upload_async = NULL;
    }
    free_pending_tx_queue(pss);
    free_receive_buffer(pss);
    break;
  }

  default:
    break;
  }

  return 0;
}

/******************************************************************************/

/* Periodic GLib timer callback that drives libwebsockets from the GLib main loop.
 *
 * libwebsockets is not automatically integrated with GLib, so we call
 * lws_service() periodically to allow it to process network events.
 *
 * The timeout argument (1ms) is the maximum time lws_service() may block
 * while waiting for network activity.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
gboolean
lws_glib_service(gpointer user_data)
{
  struct lws_context *context = user_data;

  /* Service libwebsockets may block up to 1ms */
  lws_service(context, 1);

  return G_SOURCE_CONTINUE;
}

/******************************************************************************/

/* Protocol list for this WebSocket server */
static const struct lws_protocols protocols[] = { {
                                                      .name = "sysstats",
                                                      .callback = ws_callback,
                                                      .per_session_data_size = sizeof(struct per_session_data),
                                                  },
                                                  { NULL, NULL, 0, 0, 0, NULL, 0 } };

bool
ws_server_start(struct app_state *app, int port)
{
  struct lws_context_creation_info info;

  if (!app) {
    return false;
  }
  ws.app = app;

  /* Create WebSocket context */
  memset(&info, 0, sizeof(info));
  info.port = port;
  info.protocols = protocols;
  info.gid = -1;
  info.uid = -1;
  info.user = app;

  /* Set log level to error and warning only */
  lws_set_log_level(LLL_ERR | LLL_WARN, NULL);

  ws.ctx = lws_create_context(&info);
  if (!ws.ctx) {
    syslog(LOG_ERR, "Failed to create libwebsockets context");
    return false;
  }

  /* Drive libwebsockets from the GLib main loop.
   *
   * - lws_glib_service(): periodically services libwebsockets so it can
   *   process network events and invoke protocol callbacks.
   * - ws_server internally starts a statistics timer that periodically
   *   updates app_state::stats while at least one client has enabled
   *   stats_stream.
   */
  ws.lws_timer_id = g_timeout_add(10, lws_glib_service, ws.ctx);

  return true;
}

void
ws_server_stop(void)
{
  GMainContext *main_context = g_main_context_default();

  stop_stats_timer();
  ws_pending_client_count = 0;
  ws_connected_client_count = 0;
  ws_streaming_client_count = 0;

  /* Stop the GLib timer that drives libwebsockets servicing */
  if (ws.lws_timer_id != 0) {
    g_source_remove(ws.lws_timer_id);
    ws.lws_timer_id = 0;
  }
  /* Destroy the lws_context */
  if (ws.ctx) {
    lws_context_destroy(ws.ctx);
    ws.ctx = NULL;
  }

  /* Wait for background upload work to finish after websocket teardown has
   * marked all per-session upload helpers closed.
   */
  file_upload_async_shutdown();

  /* Drain upload completion callbacks that may already have been queued onto
   * the default GLib context before shutdown started. Closed sessions clear
   * their callback pointers, so these iterations only release async state.
   */
  while (main_context && g_main_context_pending(main_context)) {
    g_main_context_iteration(main_context, FALSE);
  }

  ws.app = NULL;
}

/******************************************************************************/
