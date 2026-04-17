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
 * Current worst-case payload includes aggregate stats, per-process stats,
 * and a per-core CPU usage array, so we reserve additional headroom for
 * systems with a larger CPU count.
 * Messages are constructed using snprintf() and dropped on truncation.
 */
#define MAX_WS_MESSAGE_LENGTH 4096

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

/* Maximum size (bytes) of a typical control message.
 *
 * Examples:
 * - { "monitor": "process_name" }
 * - { "storage": true }
 * - { "system_info": true }
 */
#define MAX_SMALL_CONTROL_MESSAGE_LENGTH 128U

/* Maximum size (bytes) of a single incoming WebSocket text message.
 *
 * The receive path accumulates fragments until one full client message is
 * available, then parses it as JSON.
 *
 * Messages larger than this limit are rejected.
 */
#define MAX_RECEIVE_MESSAGE_LENGTH MAX_SMALL_CONTROL_MESSAGE_LENGTH

/* Maximum length of a single log line forwarded to WebSocket clients.
 *
 * Lines longer than this are truncated before encoding.  The value is chosen
 * to comfortably hold one syslog entry including facility, timestamp, host,
 * tag, and message text.
 */
#define MAX_LOG_LINE_LENGTH 512U
