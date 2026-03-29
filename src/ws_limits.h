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
 * This size limit applies to the final decoded file contents written to disk.
 */
#define MAX_UPLOAD_FILE_SIZE_BYTES (10U * 1024U * 1024U)

/* Maximum decoded payload size accepted in one upload chunk.
 *
 * Uploads are transferred as a sequence of small base64-encoded JSON chunk
 * messages. This keeps per-connection receive buffering bounded even when the
 * total file size is much larger.
 */
#define MAX_UPLOAD_CHUNK_SIZE_BYTES (32U * 1024U)

/* Maximum encoded base64 length required to carry one upload chunk. */
#define MAX_UPLOAD_CHUNK_BASE64_LENGTH ((((MAX_UPLOAD_CHUNK_SIZE_BYTES) + 2U) / 3U) * 4U)

/* Maximum size (bytes) of a typical non-upload control message.
 *
 * Examples:
 * - { "monitor": "process_name" }
 * - { "storage": true }
 * - { "system_info": true }
 */
#define MAX_SMALL_CONTROL_MESSAGE_LENGTH 128U

/* Extra headroom reserved for upload chunk JSON metadata.
 *
 * This covers:
 * - JSON object punctuation
 * - Upload control key names
 * - The filename field
 * - The size_bytes field
 */
#define MAX_UPLOAD_CHUNK_JSON_OVERHEAD 1024U

/* Maximum size (bytes) of a single incoming WebSocket text message.
 *
 * The receive path accumulates fragments until one full client message is
 * available, then parses it as JSON. Uploads are chunked into bounded JSON
 * control messages, so the receive cap remains small for every connection
 * instead of scaling with the full file size.
 *
 * Messages larger than this limit are rejected.
 */
#if WS_ENABLE_FILE_UPLOAD
#define MAX_RECEIVE_MESSAGE_LENGTH (MAX_UPLOAD_CHUNK_BASE64_LENGTH + MAX_UPLOAD_CHUNK_JSON_OVERHEAD)
#else
#define MAX_RECEIVE_MESSAGE_LENGTH MAX_SMALL_CONTROL_MESSAGE_LENGTH
#endif
