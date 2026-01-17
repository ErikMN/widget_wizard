#pragma once

#include "stats.h"

/* Application-owned shared state passed to subsystems and callbacks. */
struct app_state {
  /* System statistics are accessed only from the GLib main loop thread.
   * No locking is required as long as libwebsockets is serviced
   * exclusively from this loop.
   */
  struct sys_stats stats;
};
