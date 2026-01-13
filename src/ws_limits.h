#pragma once

/* Maximum number of concurrent WebSocket clients.
 *
 * Includes both fully established connections and handshakes in progress.
 * This limit bounds resource usage and prevents unbounded /proc polling
 * and per-session state allocation.
 */
#define MAX_WS_CONNECTED_CLIENTS 10

/* Maximum size of a single JSON WebSocket message.
 *
 * Current worst-case payload is around 320 bytes (including per-process stats),
 * leaving ample headroom for numeric growth and minor field additions.
 * Messages are constructed using snprintf() and dropped on truncation.
 */
#define MAX_WS_MESSAGE_LENGTH 1024

/* Maximum size (bytes) of the one-shot JSON response for the process list.
 *
 * The list response is formatted as:
 *   { "processes": ["name1","name2", ...] }
 *
 * This buffer is intentionally larger than MAX_WS_MESSAGE_LENGTH because it
 * can contain hundreds of short strings. If the buffer fills up while appending
 * entries, the response is truncated (partial list is sent) rather than
 * allocating dynamically.
 *
 * NOTE:
 * This constant must be kept in sync with the per-session output buffer used
 * for list responses (pss->list_buf).
 */
#define MAX_LIST_JSON_LENGTH 8192
