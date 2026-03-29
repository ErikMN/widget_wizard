#pragma once

#include <stdbool.h>
#include <stddef.h>

/* Hardcoded upload destination directory.
 *
 * The current backend writes all uploaded files below this directory and
 * rejects path components in the provided filename.
 */
#define FILE_UPLOAD_TARGET_DIR "/tmp"

/* Maximum accepted filename length (not including the terminating NUL). */
#define MAX_UPLOAD_FILENAME_LENGTH 255

/* Maximum formatted upload path length including FILE_UPLOAD_TARGET_DIR. */
#define MAX_UPLOAD_PATH_LENGTH 512

/* Result of one upload attempt.
 *
 * On success:
 * - ok is true
 * - filename/path identify the written file
 * - size_bytes is the decoded file size
 * - overwritten reports whether a previous file existed at that path
 *
 * On failure:
 * - ok is false
 * - error_type/error_message describe the failure
 */
struct file_upload_result {
  bool ok;
  bool overwritten;
  size_t size_bytes;
  char filename[MAX_UPLOAD_FILENAME_LENGTH + 1];
  char path[MAX_UPLOAD_PATH_LENGTH];
  char error_type[32];
  char error_message[320];
};

/* Per-connection upload session state.
 *
 * Exactly one file upload may be active per WebSocket session.
 */
struct file_upload_state {
  bool active;
  bool overwritten;
  size_t expected_size_bytes;
  size_t written_size_bytes;
  int fd;
  char filename[MAX_UPLOAD_FILENAME_LENGTH + 1];
  char path[MAX_UPLOAD_PATH_LENGTH];
};

/* Initialize one upload session state object to its inactive baseline. */
void file_upload_reset_state(struct file_upload_state *state);

/* Abort the active upload, if any, and remove a partially written file. */
void file_upload_abort(struct file_upload_state *state);

/* Start one new upload session.
 *
 * Input:
 * - filename/filename_len: file basename provided by the client
 * - expected_size_bytes: final decoded file size the client intends to send
 *
 * Behavior:
 * - Writes only below FILE_UPLOAD_TARGET_DIR
 * - Overwrites an existing file with the same name
 * - Rejects files larger than MAX_UPLOAD_FILE_SIZE_BYTES
 * - Opens the destination path and prepares to append chunk data
 *
 * Returns true on success. On failure, out receives a structured error result.
 */
bool file_upload_begin(struct file_upload_state *state,
                       const char *filename,
                       size_t filename_len,
                       size_t expected_size_bytes,
                       struct file_upload_result *out);

/* Append one base64-encoded upload chunk to the active session.
 *
 * Input:
 * - content_b64/content_b64_len: one chunk of base64-encoded file data
 *
 * Behavior:
 * - Rejects invalid base64
 * - Rejects chunks larger than MAX_UPLOAD_CHUNK_SIZE_BYTES after decoding
 * - Writes decoded bytes directly to the already opened destination file
 * - Rejects uploads whose cumulative size would exceed expected_size_bytes
 *
 * Returns true on success. On failure, the active upload is aborted and out
 * receives a structured error result.
 */
bool file_upload_append_base64_chunk(struct file_upload_state *state,
                                     const char *content_b64,
                                     size_t content_b64_len,
                                     struct file_upload_result *out);

/* Finish the active upload session and close the destination file.
 *
 * Behavior:
 * - Verifies that the received byte count exactly matches expected_size_bytes
 * - Returns the final structured success result used by the websocket layer
 *
 * On failure, the partial file is removed and out describes the error.
 */
void file_upload_finish(struct file_upload_state *state, struct file_upload_result *out);
