#pragma once

#include "stats.h"
#include <libwebsockets.h>
#include <glib.h>

struct app_state {
  /* System statistics are accessed only from the GLib main loop thread.
   * No locking is required as long as libwebsockets is serviced
   * exclusively from this loop.
   */
  struct sys_stats stats;

  /* WebSocket */
  struct lws_context *lws_ctx;
  // unsigned int ws_connected;
  // unsigned int ws_pending;

  /* Timers */
  guint stats_timer_id;
};
