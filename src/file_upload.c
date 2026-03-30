#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <syslog.h>
#include <unistd.h>

#include <glib.h>

#include "file_upload.h"
#include "ws_limits.h"

/******************************************************************************/

/* Copy one possibly non-NUL-terminated string field into a fixed output buffer.
 *
 * - Copies at most dst_size - 1 bytes.
 * - Always NUL-terminates dst when dst is valid.
 * - Treats a NULL source as an empty string.
 *
 * This helper is used for JSON strings because libjansson exposes them as
 * separate pointer and length values rather than requiring NUL-terminated input.
 */
static void
copy_string_field(char *dst, size_t dst_size, const char *src, size_t src_len)
{
  size_t copy_len = src_len;

  /* Reject invalid output buffers up front */
  if (!dst || dst_size == 0) {
    return;
  }
  /* Treat NULL source pointers as empty strings */
  if (!src) {
    dst[0] = '\0';
    return;
  }
  /* Clamp the copy so there is always room for the terminating NUL */
  if (copy_len >= dst_size) {
    copy_len = dst_size - 1;
  }
  if (copy_len > 0) {
    memcpy(dst, src, copy_len);
  }
  dst[copy_len] = '\0';
}

/******************************************************************************/

/* Initialize one upload result to a fully zeroed baseline state. */
static void
file_upload_init_result(struct file_upload_result *out)
{
  if (!out) {
    return;
  }

  memset(out, 0, sizeof(*out));
}

/* Populate the structured error fields for one failed upload attempt. */
static void
file_upload_set_error(struct file_upload_result *out, const char *type, const char *message)
{
  if (!out) {
    return;
  }

  out->ok = false;
  out->overwritten = false;
  out->size_bytes = 0;
  copy_string_field(out->error_type, sizeof(out->error_type), type, strlen(type));
  copy_string_field(out->error_message, sizeof(out->error_message), message, strlen(message));
}

/******************************************************************************/

/* Reset one upload session back to the inactive baseline state. */
void
file_upload_reset_state(struct file_upload_state *state)
{
  if (!state) {
    return;
  }

  /* Reset all bookkeeping and restore the sentinel fd value */
  memset(state, 0, sizeof(*state));
  state->fd = -1;
}

/* Abort the active upload, if any, and remove the temporary partial file. */
void
file_upload_abort(struct file_upload_state *state)
{
  if (!state) {
    return;
  }

  /* Best-effort cleanup: the caller is already handling an error or disconnect */
  if (state->fd >= 0) {
    close(state->fd);
  }
  /* Only the temporary file is removed here so a failed upload never erases
   * the last completed destination file.
   */
  if (state->temp_path[0] != '\0') {
    unlink(state->temp_path);
  }

  file_upload_reset_state(state);
}

/******************************************************************************/

/* Validate the client-provided filename for the current upload policy.
 *
 * Current policy:
 * - Filename must not be empty
 * - Filename must fit the fixed buffers
 * - Filename must be a basename only (no '/')
 * - "." and ".." are rejected
 * - Control characters and embedded NUL bytes are rejected
 */
static bool
is_valid_upload_filename(const char *filename, size_t filename_len, char *error_message, size_t error_message_size)
{
  if (!filename || filename_len == 0) {
    snprintf(error_message, error_message_size, "Upload filename must not be empty");
    return false;
  }
  if (filename_len > MAX_UPLOAD_FILENAME_LENGTH) {
    snprintf(error_message,
             error_message_size,
             "Upload filename is too long (%zu bytes, limit %u)",
             filename_len,
             MAX_UPLOAD_FILENAME_LENGTH);
    return false;
  }
  if (memchr(filename, '\0', filename_len) != NULL) {
    snprintf(error_message, error_message_size, "Upload filename must not contain embedded NUL bytes");
    return false;
  }
  if ((filename_len == 1 && filename[0] == '.') || (filename_len == 2 && filename[0] == '.' && filename[1] == '.')) {
    snprintf(error_message, error_message_size, "Upload filename must not be '.' or '..'");
    return false;
  }

  for (size_t i = 0; i < filename_len; i++) {
    unsigned char ch = (unsigned char)filename[i];

    if (ch == '/') {
      snprintf(error_message, error_message_size, "Upload filename must not contain '/'");
      return false;
    }
    if (ch < 0x20 || ch == 0x7f) {
      snprintf(error_message, error_message_size, "Upload filename must not contain control characters");
      return false;
    }
  }

  return true;
}

/* Build the hardcoded /tmp/<filename> upload path into dst. */
static bool
build_upload_path(char *dst, size_t dst_size, const char *filename, char *error_message, size_t error_message_size)
{
  int path_len = snprintf(dst, dst_size, "%s/%s", FILE_UPLOAD_TARGET_DIR, filename);
  if (path_len < 0 || (size_t)path_len >= dst_size) {
    snprintf(error_message, error_message_size, "Upload path is too long");
    return false;
  }

  return true;
}

/* Build the mkstemp template used for one temporary upload file in /tmp. */
static bool
build_upload_temp_path_template(char *dst, size_t dst_size, char *error_message, size_t error_message_size)
{
  int path_len = snprintf(dst, dst_size, "%s/.widget_wizard-upload-XXXXXX", FILE_UPLOAD_TARGET_DIR);
  if (path_len < 0 || (size_t)path_len >= dst_size) {
    snprintf(error_message, error_message_size, "Upload temporary path is too long");
    return false;
  }

  return true;
}

enum base64_validation_status { BASE64_VALIDATION_OK = 0, BASE64_VALIDATION_INVALID, BASE64_VALIDATION_TOO_LARGE };

/* Validate one base64-encoded upload chunk before decoding it.
 *
 * The chunked upload protocol keeps each JSON message small. This helper
 * validates the alphabet, padding, and decoded size so invalid data can be
 * rejected before allocating a decode buffer.
 */
static enum base64_validation_status
validate_base64_chunk(const char *content_b64,
                      size_t content_b64_len,
                      size_t *decoded_size,
                      char *error_message,
                      size_t error_message_size)
{
  size_t padding = 0;

  if (!content_b64) {
    snprintf(error_message, error_message_size, "Upload chunk content is missing");
    return BASE64_VALIDATION_INVALID;
  }
  if (memchr(content_b64, '\0', content_b64_len) != NULL) {
    snprintf(error_message, error_message_size, "Upload chunk must not contain embedded NUL bytes");
    return BASE64_VALIDATION_INVALID;
  }
  if (content_b64_len > MAX_UPLOAD_CHUNK_BASE64_LENGTH) {
    snprintf(error_message,
             error_message_size,
             "Upload chunk is too large (%zu bytes encoded, limit %u)",
             content_b64_len,
             MAX_UPLOAD_CHUNK_BASE64_LENGTH);
    return BASE64_VALIDATION_TOO_LARGE;
  }
  if (content_b64_len == 0) {
    *decoded_size = 0;
    return BASE64_VALIDATION_OK;
  }
  if ((content_b64_len % 4U) != 0U) {
    snprintf(error_message, error_message_size, "Upload chunk is not valid base64");
    return BASE64_VALIDATION_INVALID;
  }

  /* Padding is only valid at the end of the base64 string */
  if (content_b64[content_b64_len - 1] == '=') {
    padding++;
    if (content_b64_len >= 2 && content_b64[content_b64_len - 2] == '=') {
      padding++;
    }
  }

  /* Validate the base64 alphabet and ensure '=' appears only in the trailing padding */
  for (size_t i = 0; i < content_b64_len; i++) {
    unsigned char ch = (unsigned char)content_b64[i];
    bool is_alnum = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    bool is_base64_char = is_alnum || ch == '+' || ch == '/' || ch == '=';

    if (!is_base64_char) {
      snprintf(error_message, error_message_size, "Upload chunk is not valid base64");
      return BASE64_VALIDATION_INVALID;
    }
    if (ch == '=' && i < content_b64_len - padding) {
      snprintf(error_message, error_message_size, "Upload chunk is not valid base64");
      return BASE64_VALIDATION_INVALID;
    }
  }

  /* Convert encoded length to decoded byte count without allocating yet */
  *decoded_size = (content_b64_len / 4U) * 3U - padding;
  if (*decoded_size > MAX_UPLOAD_CHUNK_SIZE_BYTES) {
    snprintf(error_message,
             error_message_size,
             "Decoded upload chunk is too large (%zu bytes, limit %u)",
             *decoded_size,
             MAX_UPLOAD_CHUNK_SIZE_BYTES);
    return BASE64_VALIDATION_TOO_LARGE;
  }

  return BASE64_VALIDATION_OK;
}

/******************************************************************************/

/* Write one decoded chunk to an already opened upload file descriptor. */
static bool
write_chunk_to_fd(int fd, const unsigned char *buf, size_t len)
{
  size_t written_total = 0;

  while (written_total < len) {
    ssize_t written = write(fd, buf + written_total, len - written_total);
    if (written < 0) {
      if (errno == EINTR) {
        continue;
      }
      return false;
    }
    if (written == 0) {
      errno = EIO;
      return false;
    }

    written_total += (size_t)written;
  }

  return true;
}

/* Decode one validated base64 chunk without requiring NUL-terminated input. */
static bool
decode_base64_chunk(const char *content_b64,
                    size_t content_b64_len,
                    size_t decoded_size,
                    guchar **decoded_buf_out,
                    gsize *actual_decoded_size_out)
{
  gint state = 0;
  guint save = 0;
  guchar *decoded_buf = NULL;
  gsize actual_decoded_size = 0;

  if (!decoded_buf_out || !actual_decoded_size_out) {
    return false;
  }

  *decoded_buf_out = NULL;
  *actual_decoded_size_out = 0;

  if (decoded_size == 0) {
    return true;
  }

  decoded_buf = g_malloc(decoded_size);
  if (!decoded_buf) {
    return false;
  }

  actual_decoded_size = g_base64_decode_step(content_b64, content_b64_len, decoded_buf, &state, &save);
  if ((size_t)actual_decoded_size != decoded_size) {
    g_free(decoded_buf);
    return false;
  }

  *decoded_buf_out = decoded_buf;
  *actual_decoded_size_out = actual_decoded_size;
  return true;
}

/* Report one upload failure and tear down the partial file state. */
static void
file_upload_fail_and_abort(struct file_upload_state *state,
                           struct file_upload_result *out,
                           const char *type,
                           const char *message)
{
  file_upload_abort(state);
  file_upload_set_error(out, type, message);
}

/******************************************************************************/

/* Start one new chunked upload session below FILE_UPLOAD_TARGET_DIR. */
bool
file_upload_begin(struct file_upload_state *state,
                  const char *filename,
                  size_t filename_len,
                  size_t expected_size_bytes,
                  struct file_upload_result *out)
{
  char error_message[320];

  file_upload_init_result(out);

#if !WS_ENABLE_FILE_UPLOAD
  file_upload_set_error(out, "upload_disabled", "File upload support is disabled");
  return false;
#else
  if (!state || !out) {
    return false;
  }
  if (state->active) {
    file_upload_set_error(out, "upload_in_progress", "An upload is already active on this connection");
    return false;
  }
  if (expected_size_bytes > MAX_UPLOAD_FILE_SIZE_BYTES) {
    snprintf(error_message,
             sizeof(error_message),
             "Decoded upload is too large (%zu bytes, limit %u)",
             expected_size_bytes,
             MAX_UPLOAD_FILE_SIZE_BYTES);
    file_upload_set_error(out, "upload_too_large", error_message);
    return false;
  }
  if (!is_valid_upload_filename(filename, filename_len, error_message, sizeof(error_message))) {
    file_upload_set_error(out, "invalid_upload_filename", error_message);
    return false;
  }

  /* Start from a clean inactive state before opening the temporary upload file */
  file_upload_reset_state(state);
  copy_string_field(state->filename, sizeof(state->filename), filename, filename_len);
  if (!build_upload_path(state->path, sizeof(state->path), state->filename, error_message, sizeof(error_message))) {
    file_upload_set_error(out, "invalid_upload_filename", error_message);
    return false;
  }
  if (!build_upload_temp_path_template(
          state->temp_path, sizeof(state->temp_path), error_message, sizeof(error_message))) {
    file_upload_set_error(out, "upload_io_error", error_message);
    file_upload_reset_state(state);
    return false;
  }

  /* Preserve overwrite information for the final success response */
  state->overwritten = access(state->path, F_OK) == 0;
  /* Write into a unique temporary file first so interrupted uploads never
   * clobber the previous completed destination file.
   */
  state->fd = g_mkstemp_full(state->temp_path, O_WRONLY, 0666);
  if (state->fd < 0) {
    snprintf(error_message, sizeof(error_message), "Failed to create upload temporary file: %s", strerror(errno));
    file_upload_set_error(out, "upload_io_error", error_message);
    file_upload_reset_state(state);
    return false;
  }

  state->active = true;
  state->expected_size_bytes = expected_size_bytes;
  state->written_size_bytes = 0;

  syslog(LOG_INFO,
         "Started upload for '%s' (%zu bytes expected)%s",
         state->path,
         state->expected_size_bytes,
         state->overwritten ? " [overwriting existing file]" : "");
  return true;
#endif
}

/* Decode and append one base64 chunk to the active upload file. */
bool
file_upload_append_base64_chunk(struct file_upload_state *state,
                                const char *content_b64,
                                size_t content_b64_len,
                                struct file_upload_result *out)
{
  char error_message[320];
  size_t decoded_size = 0;
  gsize actual_decoded_size = 0;
  guchar *decoded_buf = NULL;

  file_upload_init_result(out);

#if !WS_ENABLE_FILE_UPLOAD
  file_upload_set_error(out, "upload_disabled", "File upload support is disabled");
  return false;
#else
  if (!state || !out) {
    return false;
  }
  if (!state->active || state->fd < 0) {
    file_upload_set_error(out, "upload_not_started", "No active upload is in progress");
    return false;
  }

  enum base64_validation_status validation_status =
      validate_base64_chunk(content_b64, content_b64_len, &decoded_size, error_message, sizeof(error_message));
  if (validation_status != BASE64_VALIDATION_OK) {
    const char *error_type =
        validation_status == BASE64_VALIDATION_TOO_LARGE ? "upload_chunk_too_large" : "invalid_upload_content";
    file_upload_fail_and_abort(state, out, error_type, error_message);
    return false;
  }
  /* Keep the cumulative byte count bounded by the size declared in upload_begin */
  if (state->written_size_bytes > state->expected_size_bytes ||
      decoded_size > state->expected_size_bytes - state->written_size_bytes) {
    file_upload_fail_and_abort(
        state, out, "upload_size_mismatch", "Upload received more data than declared in upload_begin");
    return false;
  }

  if (!decode_base64_chunk(content_b64, content_b64_len, decoded_size, &decoded_buf, &actual_decoded_size)) {
    file_upload_fail_and_abort(state, out, "invalid_upload_content", "Upload chunk could not be decoded");
    return false;
  }

  /* Write the decoded chunk directly so memory use stays bounded by chunk size */
  if (!write_chunk_to_fd(state->fd, decoded_buf, (size_t)actual_decoded_size)) {
    int saved_errno = errno;
    g_free(decoded_buf);
    snprintf(error_message, sizeof(error_message), "Failed to write upload chunk: %s", strerror(saved_errno));
    file_upload_fail_and_abort(state, out, "upload_io_error", error_message);
    return false;
  }
  g_free(decoded_buf);
  state->written_size_bytes += (size_t)actual_decoded_size;

  return true;
#endif
}

/* Finish the active upload and return the final success or error result. */
void
file_upload_finish(struct file_upload_state *state, struct file_upload_result *out)
{
  char filename[MAX_UPLOAD_FILENAME_LENGTH + 1];
  char path[MAX_UPLOAD_PATH_LENGTH];
  char temp_path[MAX_UPLOAD_PATH_LENGTH];
  bool overwritten = false;
  size_t size_bytes = 0;
  char error_message[320];

  file_upload_init_result(out);

#if !WS_ENABLE_FILE_UPLOAD
  file_upload_set_error(out, "upload_disabled", "File upload support is disabled");
  return;
#else
  if (!state || !out) {
    return;
  }
  if (!state->active || state->fd < 0) {
    file_upload_set_error(out, "upload_not_started", "No active upload is in progress");
    return;
  }
  if (state->written_size_bytes != state->expected_size_bytes) {
    file_upload_fail_and_abort(
        state, out, "upload_size_mismatch", "Upload finished before the declared file size was received");
    return;
  }

  copy_string_field(filename, sizeof(filename), state->filename, strlen(state->filename));
  copy_string_field(path, sizeof(path), state->path, strlen(state->path));
  copy_string_field(temp_path, sizeof(temp_path), state->temp_path, strlen(state->temp_path));
  overwritten = state->overwritten;
  size_bytes = state->written_size_bytes;

  /* A close failure after successful writes still leaves the temporary file
   * unusable, so the upload is rejected and the old destination file is left
   * untouched.
   */
  if (close(state->fd) != 0) {
    int saved_errno = errno;
    unlink(state->temp_path);
    file_upload_reset_state(state);
    snprintf(error_message, sizeof(error_message), "Failed to finalize uploaded file: %s", strerror(saved_errno));
    file_upload_set_error(out, "upload_io_error", error_message);
    return;
  }
  state->fd = -1;

  /* Atomic rename ensures the old completed file remains available unless the
   * whole upload finished successfully.
   */
  if (rename(temp_path, path) != 0) {
    int saved_errno = errno;
    unlink(temp_path);
    file_upload_reset_state(state);
    snprintf(error_message, sizeof(error_message), "Failed to install uploaded file: %s", strerror(saved_errno));
    file_upload_set_error(out, "upload_io_error", error_message);
    return;
  }

  file_upload_init_result(out);
  out->ok = true;
  out->overwritten = overwritten;
  out->size_bytes = size_bytes;
  copy_string_field(out->filename, sizeof(out->filename), filename, strlen(filename));
  copy_string_field(out->path, sizeof(out->path), path, strlen(path));
  file_upload_reset_state(state);

  syslog(LOG_INFO, "Stored uploaded file '%s' (%zu bytes)%s", path, size_bytes, overwritten ? " [overwritten]" : "");
#endif
}
