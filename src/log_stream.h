#pragma once

#include <stdbool.h>

/* Forward declarations - callers must include the relevant headers */
struct per_session_data;
typedef struct json_t json_t;

/*
 * Handle a { "log_stream": true/false } request from a WebSocket client.
 *
 * Returns true if the key was present in root (whether or not the value was
 * valid), false if root contains no "log_stream" key.
 */
bool log_stream_handle_request(struct per_session_data *pss, json_t *root);

/*
 * Remove pss from the subscriber list, stopping the inotify monitor when
 * the last subscriber disconnects.  Safe to call even if pss was never
 * subscribed.
 */
void log_stream_unsubscribe(struct per_session_data *pss);

/*
 * Stop the monitor and release all state.  Called once on server shutdown.
 */
void log_stream_stop(void);
