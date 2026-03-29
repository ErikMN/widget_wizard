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

/* Feature flag for WebSocket file upload support.
 *
 * Set to 0 to compile out the upload handler and restore the original
 * small-message receive limit.
 */
#define WS_ENABLE_FILE_UPLOAD 1

/* Maximum decoded file size accepted by the upload handler.
 *
 * The current upload protocol carries one whole file as base64 inside a
 * JSON WebSocket text message. This size limit applies to the decoded
 * file contents written to disk.
 */
#define MAX_UPLOAD_FILE_SIZE_BYTES (10U * 1024U * 1024U)

/* Maximum length of the base64 string required to carry MAX_UPLOAD_FILE_SIZE_BYTES.
 *
 * The upload handler validates the base64 payload before decoding it and
 * rejects anything larger than this bound.
 */
#define MAX_UPLOAD_BASE64_LENGTH ((((MAX_UPLOAD_FILE_SIZE_BYTES) + 2U) / 3U) * 4U)

/* Maximum size (bytes) of a typical non-upload control message.
 *
 * Examples:
 * - { "monitor": "process_name" }
 * - { "storage": true }
 * - { "system_info": true }
 */
#define MAX_SMALL_CONTROL_MESSAGE_LENGTH 128U

/* Extra headroom reserved for upload JSON metadata.
 *
 * This covers:
 * - JSON object punctuation
 * - Command key names
 * - The filename field
 * - Small future metadata additions
 */
#define MAX_UPLOAD_JSON_OVERHEAD 1024U

/* Maximum size (bytes) of a single incoming WebSocket text message.
 *
 * The receive path accumulates fragments until one full client message is
 * available, then parses it as JSON. With uploads enabled, the bound must
 * cover the full base64 payload plus JSON metadata. Without uploads, the
 * original small-message limit is used.
 *
 * Messages larger than this limit are rejected.
 */
#if WS_ENABLE_FILE_UPLOAD
#define MAX_RECEIVE_MESSAGE_LENGTH (MAX_UPLOAD_BASE64_LENGTH + MAX_UPLOAD_JSON_OVERHEAD)
#else
#define MAX_RECEIVE_MESSAGE_LENGTH MAX_SMALL_CONTROL_MESSAGE_LENGTH
#endif
