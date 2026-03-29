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

/* Decode and store one uploaded file.
 *
 * Input:
 * - filename/filename_len: file basename provided by the client
 * - content_b64/content_b64_len: base64-encoded file data
 *
 * Behavior:
 * - Writes only below FILE_UPLOAD_TARGET_DIR
 * - Overwrites an existing file with the same name
 * - Rejects decoded payloads larger than MAX_UPLOAD_FILE_SIZE_BYTES
 * - Returns a structured result that can be serialized to JSON
 *
 * If WS_ENABLE_FILE_UPLOAD is 0, the function reports "upload_disabled".
 */
void file_upload_store_base64(const char *filename,
                              size_t filename_len,
                              const char *content_b64,
                              size_t content_b64_len,
                              struct file_upload_result *out);
