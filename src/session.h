#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <sys/types.h>
#include <libwebsockets.h>

#include "proc.h"
#include "ws_limits.h"

/* Per-connected WebSocket client (per-session) storage.
 * libwebsockets gives us one instance of this struct for each connection and
 * passes it back as the "user" pointer in ws_callback().
 *
 * Buffer layout:
 * - First LWS_PRE bytes: reserved for libwebsockets (must not be written)
 * - Remaining bytes: outgoing message payload (JSON)
 */
struct per_session_data {
  /* NOTE: Buffers must be large enough for the biggest JSON payload */
  unsigned char stream_buf[LWS_PRE + MAX_WS_MESSAGE_LENGTH];
  unsigned char list_buf[LWS_PRE + MAX_LIST_JSON_LENGTH];

  /* True if this connection was counted toward ws_connected_client_count */
  bool counted;

  /* Process monitoring */
  char proc_name[MAX_PROC_NAME_LENGTH];
  bool proc_enabled;

  /* Per-process CPU baseline */
  unsigned long long prev_proc_utime;
  unsigned long long prev_proc_stime;
  uint64_t prev_proc_sample_mono_ms;

  /* Cached PID of the monitored process (0 = unknown / needs lookup) */
  pid_t proc_pid;
};
