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

/* Validate the client-provided filename for the current upload policy.
 *
 * Current policy:
 * - Filename must not be empty
 * - Filename must fit the fixed per-result buffers
 * - Filename must be a basename only (no '/')
 * - "." and ".." are rejected
 * - Control characters and embedded NUL bytes are rejected
 *
 * This keeps uploads confined to FILE_UPLOAD_TARGET_DIR while still allowing
 * arbitrary basenames inside that directory.
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

enum base64_validation_status { BASE64_VALIDATION_OK = 0, BASE64_VALIDATION_INVALID, BASE64_VALIDATION_TOO_LARGE };

/* Validate one base64 payload before decoding it.
 *
 * The upload protocol carries one complete file as a base64 string inside
 * the JSON command. This helper performs cheap structural checks first so
 * invalid or oversized uploads can be rejected before allocating decoded
 * storage.
 *
 * On success:
 * - Returns BASE64_VALIDATION_OK
 * - Writes the decoded byte count to *decoded_size
 */
static enum base64_validation_status
validate_base64_payload(const char *content_b64,
                        size_t content_b64_len,
                        size_t *decoded_size,
                        char *error_message,
                        size_t error_message_size)
{
  /* Base64 padding may use up to two trailing '=' characters */
  size_t padding = 0;

  if (!content_b64) {
    snprintf(error_message, error_message_size, "Upload content is missing");
    return BASE64_VALIDATION_INVALID;
  }
  if (memchr(content_b64, '\0', content_b64_len) != NULL) {
    snprintf(error_message, error_message_size, "Upload content must not contain embedded NUL bytes");
    return BASE64_VALIDATION_INVALID;
  }
  if (content_b64_len > MAX_UPLOAD_BASE64_LENGTH) {
    snprintf(error_message,
             error_message_size,
             "Upload payload is too large (%zu bytes encoded, limit %u)",
             content_b64_len,
             MAX_UPLOAD_BASE64_LENGTH);
    return BASE64_VALIDATION_TOO_LARGE;
  }
  if (content_b64_len == 0) {
    *decoded_size = 0;
    return BASE64_VALIDATION_OK;
  }
  if ((content_b64_len % 4U) != 0U) {
    snprintf(error_message, error_message_size, "Upload content is not valid base64");
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
      snprintf(error_message, error_message_size, "Upload content is not valid base64");
      return BASE64_VALIDATION_INVALID;
    }
    if (ch == '=') {
      if (i < content_b64_len - padding) {
        snprintf(error_message, error_message_size, "Upload content is not valid base64");
        return BASE64_VALIDATION_INVALID;
      }
    }
  }

  /* Convert encoded length to decoded byte count without allocating yet */
  *decoded_size = (content_b64_len / 4U) * 3U - padding;
  if (*decoded_size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    snprintf(error_message,
             error_message_size,
             "Decoded upload is too large (%zu bytes, limit %u)",
             *decoded_size,
             MAX_UPLOAD_FILE_SIZE_BYTES);
    return BASE64_VALIDATION_TOO_LARGE;
  }

  return BASE64_VALIDATION_OK;
}

/******************************************************************************/

/* Write one fully decoded file to disk.
 *
 * Behavior:
 * - Opens the target path with O_TRUNC so existing files are overwritten
 * - Retries write() when interrupted by EINTR
 * - Removes the partially written file if a write/close error occurs
 *
 * Returns true only if the whole buffer was written successfully.
 */
static bool
write_full_file(const char *path, const unsigned char *buf, size_t len)
{
  /* Always truncate so re-uploading the same filename cleanly overwrites it */
  int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (fd < 0) {
    return false;
  }

  size_t written_total = 0;
  while (written_total < len) {
    /* write() may complete partially, so keep advancing until the whole buffer is stored */
    ssize_t written = write(fd, buf + written_total, len - written_total);
    if (written < 0) {
      if (errno == EINTR) {
        continue;
      }
      /* Remove a partially written file so callers never observe truncated content */
      int saved_errno = errno;
      close(fd);
      unlink(path);
      errno = saved_errno;
      return false;
    }
    if (written == 0) {
      close(fd);
      unlink(path);
      errno = EIO;
      return false;
    }

    written_total += (size_t)written;
  }

  /* close() can still fail after a successful write loop */
  if (close(fd) != 0) {
    unlink(path);
    return false;
  }

  return true;
}

/******************************************************************************/

/* Decode and store one uploaded file below FILE_UPLOAD_TARGET_DIR.
 *
 * This function keeps the upload policy isolated from ws_server.c so the
 * websocket layer only needs to parse the JSON command and pass over the
 * string fields.
 *
 * Processing steps:
 * - Validate the basename-only filename policy
 * - Validate the base64 payload and enforce the 10 MiB decoded-size limit
 * - Decode the payload using GLib's base64 helper
 * - Write the decoded file to /tmp/<filename>
 * - Return a structured success/error result for JSON serialization
 */
void
file_upload_store_base64(const char *filename,
                         size_t filename_len,
                         const char *content_b64,
                         size_t content_b64_len,
                         struct file_upload_result *out)
{
  char error_message[sizeof(out->error_message)];

  file_upload_init_result(out);

#if !WS_ENABLE_FILE_UPLOAD
  file_upload_set_error(out, "upload_disabled", "File upload support is disabled");
  return;
#else
  if (!out) {
    return;
  }

  /* Reject path traversal and other unsupported filename forms before building /tmp/<name> */
  if (!is_valid_upload_filename(filename, filename_len, error_message, sizeof(error_message))) {
    file_upload_set_error(out, "invalid_upload_filename", error_message);
    return;
  }

  /* Validate structure and size before allocating the decoded payload */
  size_t decoded_size = 0;
  enum base64_validation_status validation_status =
      validate_base64_payload(content_b64, content_b64_len, &decoded_size, error_message, sizeof(error_message));
  if (validation_status != BASE64_VALIDATION_OK) {
    const char *error_type =
        validation_status == BASE64_VALIDATION_TOO_LARGE ? "upload_too_large" : "invalid_upload_content";
    file_upload_set_error(out, error_type, error_message);
    return;
  }

  copy_string_field(out->filename, sizeof(out->filename), filename, filename_len);

  /* Build the final hardcoded destination path under /tmp */
  int path_len = snprintf(out->path, sizeof(out->path), "%s/%s", FILE_UPLOAD_TARGET_DIR, out->filename);
  if (path_len < 0 || (size_t)path_len >= sizeof(out->path)) {
    file_upload_set_error(out, "invalid_upload_filename", "Upload path is too long");
    return;
  }

  /* Expose overwrite behavior in the JSON response for the UI */
  out->overwritten = access(out->path, F_OK) == 0;

  /* Decode only after validation so invalid uploads fail without extra allocation */
  gsize actual_decoded_size = 0;
  guchar *decoded_buf = g_base64_decode(content_b64, &actual_decoded_size);
  if (!decoded_buf && decoded_size != 0) {
    file_upload_set_error(out, "invalid_upload_content", "Upload content could not be decoded");
    return;
  }
  /* The pre-validation size calculation should agree with the decoder output */
  if ((size_t)actual_decoded_size != decoded_size) {
    g_free(decoded_buf);
    file_upload_set_error(out, "invalid_upload_content", "Upload content could not be decoded");
    return;
  }

  /* Persist the decoded bytes as the final uploaded file */
  if (!write_full_file(out->path, decoded_buf, (size_t)actual_decoded_size)) {
    int saved_errno = errno;
    g_free(decoded_buf);
    snprintf(error_message, sizeof(error_message), "Failed to write uploaded file: %s", strerror(saved_errno));
    file_upload_set_error(out, "upload_io_error", error_message);
    return;
  }

  g_free(decoded_buf);

  out->ok = true;
  out->size_bytes = (size_t)actual_decoded_size;
  out->error_type[0] = '\0';
  out->error_message[0] = '\0';

  syslog(LOG_INFO,
         "Stored uploaded file '%s' (%zu bytes)%s",
         out->path,
         out->size_bytes,
         out->overwritten ? " [overwritten]" : "");
#endif
}
