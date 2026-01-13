#pragma once

#include <libwebsockets.h>
#include <glib.h>

/* WebSocket server state */
extern struct lws_context *lws_ctx;

/* Connection accounting */
extern unsigned int ws_connected_client_count;
extern unsigned int ws_pending_client_count;

/* Protocol table exported to main.c */
extern const struct lws_protocols protocols[];

/* Starts and stops system sampling based on client count */
void start_stats_timer(void);
void stop_stats_timer(void);

/* GLib timer used to drive libwebsockets */
gboolean lws_glib_service(gpointer user_data);
