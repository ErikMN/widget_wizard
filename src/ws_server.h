#pragma once

#include <stdbool.h>

#include "app_state.h"

/* Initialize and start the WebSocket server.
 *
 * Returns true on success, false on failure.
 */
bool ws_server_start(struct app_state *app, int port);

/* Stop the WebSocket server and release all resources.
 * Safe to call multiple times.
 */
void ws_server_stop(void);
