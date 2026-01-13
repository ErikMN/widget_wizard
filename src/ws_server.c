#include <syslog.h>
#include <string.h>

#include <jansson.h>
#include <libwebsockets.h>
#include <glib.h>

#include "session.h"
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

  update_sys_stats(&app->stats);

  return G_SOURCE_CONTINUE;
}

/******************************************************************************/

/*
 * Statistics sampling timer:
 *
 * - The stats timer is started when the first WebSocket client connects.
 * - The stats timer is stopped when the last client disconnects.
 *
 * Rationale:
 * - Avoid unnecessary /proc polling when no clients are connected.
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

/* WebSocket protocol callback
 *
 * - Server sends periodic JSON snapshots.
 * - NOTE: Messages are write-only: incoming messages are ignored.
 * - Update rate is approximately 500 ms per client.
 * - CPU usage is reported as a percentage [0.0 - 100.0].
 * - Memory values are reported in kilobytes.
 * - The first CPU value after connect may be 0.0 due to baseline initialization.
 * - Only allow MAX_WS_CONNECTED_CLIENTS concurrent connections.
 */
static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  switch (reason) {

  case LWS_CALLBACK_ESTABLISHED: {
    struct per_session_data *pss = user;

    /* Convert one pending slot to active */
    if (ws_pending_client_count > 0) {
      ws_pending_client_count--;
    }

    ws_connected_client_count++;
    pss->counted = true;

    /* If at least one connection: start the timer */
    if (ws_connected_client_count == 1) {
      start_stats_timer();
    }
    syslog(LOG_INFO, "WebSocket client connected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    /* Send immediately */
    lws_callback_on_writable(wsi);
    /* Then every 500ms */
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
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
   * All clients observe the same latest_stats snapshot.
   */
  case LWS_CALLBACK_TIMER: {
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

    if (!pss || len == 0 || len >= 128) {
      break;
    }

    char msg[128 + 1];
    memcpy(msg, in, len);
    msg[len] = '\0';

    /* Parse JSON using libjansson */
    json_error_t json_error;
    json_t *root = json_loads(msg, 0, &json_error);
    if (!root || !json_is_object(root)) {
      syslog(LOG_WARNING,
             "Invalid JSON received: %s (line %d, column %d)",
             json_error.text,
             json_error.line,
             json_error.column);
      if (root) {
        json_decref(root);
      }
      break;
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
        int written = lws_write(wsi, &pss->list_buf[LWS_PRE], out_len, LWS_WRITE_TEXT);
        if (written < 0) {
          syslog(LOG_WARNING, "lws_write failed");
        }
      }
      if (truncated) {
        syslog(LOG_INFO, "Process list response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
      }
      json_decref(root);
      break;
    }

    /* One-shot storage info request: { "storage": true } */
    json_t *storage_req = json_object_get(root, "storage");
    if (json_is_true(storage_req)) {
      bool truncated = false;
      size_t out_len = build_storage_json((char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, &truncated);
      if (out_len > 0) {
        int written = lws_write(wsi, &pss->list_buf[LWS_PRE], out_len, LWS_WRITE_TEXT);
        if (written < 0) {
          syslog(LOG_WARNING, "lws_write failed");
        }
      }
      if (truncated) {
        syslog(LOG_INFO, "Storage response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
      }
      json_decref(root);
      break;
    }

    /* Expect JSON: { "monitor": "process_name" } */
    json_t *monitor = json_object_get(root, "monitor");
    if (!monitor) {
      json_decref(root);
      break;
    }

    /* Explicit stop-monitoring command: { "monitor": "" } */
    if (json_is_string(monitor) && json_string_value(monitor)[0] == '\0') {
      pss->proc_enabled = false;
      pss->proc_name[0] = '\0';
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      pss->proc_pid = 0;
      syslog(LOG_INFO, "Client stopped process monitoring");
      json_decref(root);
      break;
    }

    /* Normal start-monitoring command */
    if (json_is_string(monitor)) {
      strncpy(pss->proc_name, json_string_value(monitor), sizeof(pss->proc_name) - 1);
      pss->proc_name[sizeof(pss->proc_name) - 1] = '\0';
      pss->proc_enabled = true;
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      pss->proc_pid = 0;
      syslog(LOG_INFO, "Client monitoring process: %s", pss->proc_name);
    }
    json_decref(root);
    break;
  }

  case LWS_CALLBACK_CLOSED: {
    struct per_session_data *pss = user;

    if (pss && pss->counted) {
      if (ws_connected_client_count > 0) {
        ws_connected_client_count--;
      }
      /* If no connections: Stop the timer */
      if (ws_connected_client_count == 0) {
        stop_stats_timer();
      }
    }
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
    char json[MAX_WS_MESSAGE_LENGTH];
    int json_len;
    bool truncated = false;
    struct app_state *app = lws_context_user(lws_get_context(wsi));

    if (!pss) {
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
   *   updates app_state::stats while at least one client is connected.
   */
  ws.lws_timer_id = g_timeout_add(10, lws_glib_service, ws.ctx);

  return true;
}

void
ws_server_stop(void)
{
  stop_stats_timer();

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
  ws.app = NULL;
}

/******************************************************************************/
