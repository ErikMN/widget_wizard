/* file_upload.c
 *
 * HTTP multipart file upload endpoint.
 *
 * This module handles one upload request at a time for one libwebsockets
 * connection. It is called from ws_server.c when the HTTP request path matches
 * one of the upload paths accepted by file_upload_is_path(). The request body
 * is parsed by libwebsockets spa, so this code receives file content in chunks
 * instead of parsing multipart boundaries by hand.
 *
 * Upload contract:
 * - The request must use HTTP POST.
 * - Direct host calls use FILE_UPLOAD_PATH.
 * - Packaged web calls use FILE_UPLOAD_PROXY_PATH.
 * - The request body must be multipart form data.
 * - The form must contain one file field named "file".
 * - The original client filename is used only as a basename.
 * - The destination directory is FILE_UPLOAD_DEST_DIR.
 * - File content is limited to FILE_UPLOAD_MAX_BYTES.
 *
 * Safety rules:
 * - Client paths are not trusted.
 * - Characters outside a small filename set are replaced with underscores.
 * - Filenames that do not fit after cleanup are rejected instead of truncated.
 * - Data is first written to a unique temporary file.
 * - The temporary file is renamed to the final path only after a complete
 *   upload has been received and closed successfully.
 * - Failed and aborted uploads remove the temporary file.
 * - Existing files with the same cleaned filename are replaced only after the
 *   new upload has completed.
 * - The destination directory must be owned by the process user.
 *
 * Response behavior:
 * - Success returns HTTP 200.
 * - Unsupported content type returns HTTP 415.
 * - Invalid form data returns HTTP 400.
 * - Invalid filenames return HTTP 400.
 * - Files over the configured size limit return HTTP 413.
 * - Local file write failures return HTTP 500.
 *
 * Parser ownership:
 * - file_upload_start() creates the parser and stores it in file_upload_state.
 * - file_upload_process_body() feeds raw HTTP body chunks into the parser.
 * - file_upload_callback() is called by the parser when file data arrives.
 * - file_upload_complete() finalizes the parser and sends the response.
 * - file_upload_destroy() may also be called from connection cleanup paths.
 *
 * Call flow:
 *
 *   LWS_CALLBACK_HTTP
 *     |
 *     v
 *   file_upload_start()
 *     |
 *     v
 *   LWS_CALLBACK_HTTP_BODY
 *     |
 *     v
 *   file_upload_process_body()
 *     |
 *     v
 *   file_upload_callback()
 *     |
 *     v
 *   write_file_data()
 *
 *   LWS_CALLBACK_HTTP_BODY_COMPLETION
 *     |
 *     v
 *   file_upload_complete()
 *     |
 *     v
 *   final HTTP status response
 */
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <syslog.h>
#include <unistd.h>

#include <glib.h>
#include <libwebsockets.h>

#include "file_upload.h"

/* HTTP request path handled by this module. */
#define FILE_UPLOAD_PATH "/file-upload"
/* Path used when the packaged web server forwards the upload route. */
#define FILE_UPLOAD_PROXY_PATH "/local/" APP_NAME FILE_UPLOAD_PATH
/* Directory where completed uploads are stored. */
#define FILE_UPLOAD_DEST_DIR "/tmp/widget_wizard_uploads"
/* Other local apps may read uploaded files but must not write here. */
#define FILE_UPLOAD_DEST_DIR_MODE 0755
/* Completed uploads are readable by other local apps. */
#define FILE_UPLOAD_FILE_MODE 0644
/* Maximum accepted file content size. */
#define FILE_UPLOAD_MAX_BYTES (10U * 1024U * 1024U)
/* Maximum sanitized filename length including the string terminator. */
#define FILE_UPLOAD_MAX_FILENAME_LENGTH 128U
/* Maximum path buffer length used for final and temporary paths. */
#define FILE_UPLOAD_MAX_PATH_LENGTH 256U

struct file_upload_state {
  /* libwebsockets multipart parser for this request */
  struct lws_spa *spa;
  /* Temporary output file while the request is still active */
  FILE *fp;
  /* Number of file content bytes accepted so far */
  size_t bytes_written;
  /* True after the expected file field has started */
  bool file_seen;
  /* True after the temporary file was renamed to the final path */
  bool completed;
  /* True after the first upload error has been recorded */
  bool failed;
  /* HTTP status to send if the upload fails */
  unsigned int status;
  /* Human readable HTTP response message */
  const char *message;
  /* Final upload path under FILE_UPLOAD_DEST_DIR */
  char path[FILE_UPLOAD_MAX_PATH_LENGTH];
  /* Unique temporary path used while writing */
  char part_path[FILE_UPLOAD_MAX_PATH_LENGTH];
};

/* Accepted multipart file field names. */
static const char *const upload_param_names[] = { "file" };

/* Make sure the upload directory exists before opening the temporary file.
 *
 * The path is stable so other local code can find uploaded files.
 * The directory is readable by other users, but only the owner may write to it.
 * If the directory belongs to another user, fail instead of trying to repair it.
 * A root-created directory must be cleaned up by the operator.
 */
static bool
ensure_upload_dir(void)
{
  struct stat st;

  if (g_mkdir_with_parents(FILE_UPLOAD_DEST_DIR, FILE_UPLOAD_DEST_DIR_MODE) != 0) {
    syslog(LOG_WARNING, "file_upload: failed to create upload directory: %m");
    return false;
  }

  if (lstat(FILE_UPLOAD_DEST_DIR, &st) != 0) {
    syslog(LOG_WARNING, "file_upload: failed to inspect upload directory: %m");
    return false;
  }

  if (!S_ISDIR(st.st_mode)) {
    syslog(LOG_WARNING, "file_upload: upload path is not a directory");
    return false;
  }

  if (st.st_uid != getuid()) {
    syslog(LOG_WARNING, "file_upload: upload directory is owned by another user");
    return false;
  }

  if ((st.st_mode & (S_IWGRP | S_IWOTH)) != 0) {
    syslog(LOG_WARNING, "file_upload: upload directory is writable by another user");
    return false;
  }

  if (chmod(FILE_UPLOAD_DEST_DIR, FILE_UPLOAD_DEST_DIR_MODE) != 0) {
    syslog(LOG_WARNING, "file_upload: failed to set upload directory mode: %m");
    return false;
  }

  return true;
}

/* Return true when the request matches one accepted upload path. */
static bool
file_upload_path_matches(const char *uri, int uri_len, const char *path)
{
  size_t path_len = strlen(path);

  if (uri_len != (int)path_len) {
    return false;
  }

  return strncmp(uri, path, path_len) == 0;
}

/* Accept direct host calls and calls forwarded by the packaged web server. */
bool
file_upload_is_path(const char *uri, int uri_len)
{
  if (!uri) {
    return false;
  }

  if (file_upload_path_matches(uri, uri_len, FILE_UPLOAD_PATH)) {
    return true;
  }

  return file_upload_path_matches(uri, uri_len, FILE_UPLOAD_PROXY_PATH);
}

/* Keep the first failure.
 *
 * The parser may keep calling back while it cleans up a broken request. The
 * first error is normally the one that explains what actually went wrong.
 */
static void
file_upload_set_error(struct file_upload_state *state, unsigned int status, const char *message)
{
  if (!state || state->failed) {
    return;
  }

  state->failed = true;
  state->status = status;
  state->message = message;
}

/* Send a simple status response.
 *
 * Returning 1 tells libwebsockets that this HTTP transaction is done.
 */
static int
send_status(struct lws *wsi, unsigned int status, const char *message)
{
  lws_return_http_status(wsi, status, message);
  return 1;
}

/* Finish a failed request using the status stored in the upload state.
 *
 * The status and message are copied before destroying the state because
 * destroy also removes the temporary file.
 */
static int
finish_with_state_status(struct lws *wsi, struct file_upload_state **state)
{
  unsigned int status = HTTP_STATUS_INTERNAL_SERVER_ERROR;
  const char *message = "Upload failed";

  if (state && *state) {
    status = (*state)->status;
    message = (*state)->message;
  }

  file_upload_destroy(state);

  return send_status(wsi, status, message);
}

/* Return the last path component from a client supplied filename.
 *
 * Browsers normally send only a filename, but clients may send a full local
 * path. Only the basename is kept.
 */
static const char *
client_filename_basename(const char *filename)
{
  const char *base = filename;
  const char *p = NULL;

  if (!filename || filename[0] == '\0') {
    return NULL;
  }

  for (p = filename; *p; p++) {
    if (*p == '/' || *p == '\\') {
      base = p + 1;
    }
  }

  return base[0] ? base : NULL;
}

/* Build the final path and the temporary path template.
 *
 * The final path uses the cleaned client basename. The temporary file does not
 * use the client basename because it should be unique while the upload is still
 * being written.
 */
static bool
make_upload_paths(char *path, size_t path_size, char *part_path, size_t part_path_size, const char *filename)
{
  const char *base = client_filename_basename(filename);
  char safe[FILE_UPLOAD_MAX_FILENAME_LENGTH];
  size_t out = 0;
  int written;

  if (!base) {
    return false;
  }

  while (*base) {
    unsigned char c = (unsigned char)*base;

    if (out + 1 >= sizeof(safe)) {
      return false;
    }

    if (g_ascii_isalnum((gchar)c) || c == '.' || c == '_' || c == '-') {
      safe[out++] = (char)c;
    } else {
      safe[out++] = '_';
    }
    base++;
  }
  safe[out] = '\0';

  if (out == 0 || strcmp(safe, ".") == 0 || strcmp(safe, "..") == 0) {
    return false;
  }

  written = snprintf(path, path_size, "%s/%s", FILE_UPLOAD_DEST_DIR, safe);
  if (written < 0 || (size_t)written >= path_size) {
    return false;
  }

  written = snprintf(part_path, part_path_size, "%s/widget_wizard_upload_XXXXXX", FILE_UPLOAD_DEST_DIR);
  if (written < 0 || (size_t)written >= part_path_size) {
    return false;
  }

  return true;
}

/* Write one file content chunk.
 *
 * bytes_written counts only the uploaded file content. Multipart headers and
 * boundaries are handled by libwebsockets before this function is called.
 */
static bool
write_file_data(struct file_upload_state *state, const char *buf, int len)
{
  if (!state || !state->fp) {
    return false;
  }

  if (len < 0 || state->bytes_written + (size_t)len > FILE_UPLOAD_MAX_BYTES) {
    file_upload_set_error(state, HTTP_STATUS_REQ_ENTITY_TOO_LARGE, "Uploaded file is too large");
    return false;
  }

  if (len > 0 && fwrite(buf, 1, (size_t)len, state->fp) != (size_t)len) {
    syslog(LOG_WARNING, "file_upload: write failed: %m");
    file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to write uploaded file");
    return false;
  }

  state->bytes_written += (size_t)len;

  return true;
}

/* Close the temporary file and move it into place after a complete upload.
 *
 * fclose is done before rename so close errors are detected before replacing
 * the final file.
 */
static bool
finish_file(struct file_upload_state *state)
{
  if (!state || !state->fp) {
    return false;
  }

  if (fclose(state->fp) != 0) {
    state->fp = NULL;
    syslog(LOG_WARNING, "file_upload: close failed: %m");
    file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to close uploaded file");
    return false;
  }
  state->fp = NULL;

  if (chmod(state->part_path, FILE_UPLOAD_FILE_MODE) != 0) {
    syslog(LOG_WARNING, "file_upload: chmod failed: %m");
    file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to store uploaded file");
    return false;
  }

  if (rename(state->part_path, state->path) != 0) {
    syslog(LOG_WARNING, "file_upload: rename failed: %m");
    file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to store uploaded file");
    return false;
  }

  state->completed = true;
  syslog(LOG_INFO, "file_upload: stored %zu bytes at %s", state->bytes_written, state->path);

  return true;
}

/* Receive file upload events from the libwebsockets multipart parser.
 *
 * The parser calls this function with a small state machine:
 * - LWS_UFS_OPEN means a new file field is starting.
 * - LWS_UFS_CONTENT carries one chunk of file bytes.
 * - LWS_UFS_FINAL_CONTENT carries the last chunk and ends the file.
 * - LWS_UFS_CLOSE is parser cleanup after the file has ended or failed.
 *
 * This callback accepts only one file field named "file". The temporary file is
 * created when that field opens, written as chunks arrive, and renamed only
 * after the final content callback has been written successfully.
 */
static int
file_upload_callback(void *data,
                     const char *name,
                     const char *filename,
                     char *buf,
                     int len,
                     enum lws_spa_fileupload_states upload_state)
{
  struct file_upload_state *state = data;
  int fd;

  if (!state || state->failed) {
    return -1;
  }

  switch (upload_state) {
  case LWS_UFS_OPEN:
    if (state->file_seen || !name || strcmp(name, "file") != 0) {
      file_upload_set_error(state, HTTP_STATUS_BAD_REQUEST, "Expected one file field named file");
      return -1;
    }

    if (!ensure_upload_dir()) {
      file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to open upload directory");
      return -1;
    }

    if (!make_upload_paths(state->path, sizeof(state->path), state->part_path, sizeof(state->part_path), filename)) {
      file_upload_set_error(state, HTTP_STATUS_BAD_REQUEST, "Invalid upload filename");
      return -1;
    }

    fd = mkstemp(state->part_path);
    if (fd < 0) {
      syslog(LOG_WARNING, "file_upload: temporary file creation failed: %m");
      file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to open upload file");
      return -1;
    }

    state->fp = fdopen(fd, "wb");
    if (!state->fp) {
      close(fd);
      unlink(state->part_path);
      syslog(LOG_WARNING, "file_upload: open failed: %m");
      file_upload_set_error(state, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Failed to open upload file");
      return -1;
    }

    state->file_seen = true;
    return 0;

  case LWS_UFS_CONTENT:
    return write_file_data(state, buf, len) ? 0 : -1;

  case LWS_UFS_FINAL_CONTENT:
    if (!write_file_data(state, buf, len)) {
      return -1;
    }
    return finish_file(state) ? 0 : -1;

  case LWS_UFS_CLOSE:
    return 0;

  default:
    file_upload_set_error(state, HTTP_STATUS_BAD_REQUEST, "Invalid upload state");
    return -1;
  }
}

/* Check that the request body uses multipart form data.
 *
 * The media type may be followed by parameters such as the boundary. Accept
 * only the exact media type or the same media type followed by a semicolon.
 */
static bool
request_is_multipart(struct lws *wsi)
{
  char content_type[128];
  const char *media_type = "multipart/form-data";
  size_t media_type_len = strlen(media_type);

  if (lws_hdr_copy(wsi, content_type, sizeof(content_type), WSI_TOKEN_HTTP_CONTENT_TYPE) <= 0) {
    return false;
  }

  if (g_ascii_strncasecmp(content_type, media_type, media_type_len) != 0) {
    return false;
  }

  return content_type[media_type_len] == '\0' || content_type[media_type_len] == ';';
}

/* Create parser state for a new upload request.
 *
 * ws_server.c has already checked the path and method before calling this
 * function. This function checks the content type, clears any stale state,
 * and creates the libwebsockets parser for the request body.
 */
int
file_upload_start(struct lws *wsi, struct file_upload_state **state)
{
  struct file_upload_state *upload = NULL;
  lws_spa_create_info_t info;

  if (!wsi || !state) {
    return send_status(wsi, HTTP_STATUS_INTERNAL_SERVER_ERROR, "Missing upload state");
  }

  if (!request_is_multipart(wsi)) {
    return send_status(wsi, HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE, "Expected multipart form data");
  }

  file_upload_destroy(state);

  upload = g_new0(struct file_upload_state, 1);
  upload->status = HTTP_STATUS_INTERNAL_SERVER_ERROR;
  upload->message = "Upload failed";

  memset(&info, 0, sizeof(info));
  info.param_names = upload_param_names;
  info.count_params = G_N_ELEMENTS(upload_param_names);
  info.max_storage = 256;
  info.opt_cb = file_upload_callback;
  info.opt_data = upload;

  upload->spa = lws_spa_create_via_info(wsi, &info);
  if (!upload->spa) {
    g_free(upload);
    return send_status(wsi, HTTP_STATUS_BAD_REQUEST, "Invalid multipart upload");
  }

  *state = upload;

  return 0;
}

/* Feed one HTTP body chunk into the multipart parser.
 *
 * libwebsockets may split a request body into many chunks. The parser keeps
 * its own position between calls and calls file_upload_callback() whenever it
 * has file data ready.
 */
int
file_upload_process_body(struct lws *wsi, struct file_upload_state **state, const void *in, size_t len)
{
  if (!state || !*state || (!in && len != 0)) {
    return send_status(wsi, HTTP_STATUS_BAD_REQUEST, "Upload has not been started");
  }

  if (len == 0) {
    return 0;
  }

  if (len > (size_t)G_MAXINT || lws_spa_process((*state)->spa, in, (int)len) != 0) {
    if (!(*state)->failed) {
      file_upload_set_error(*state, HTTP_STATUS_BAD_REQUEST, "Invalid upload body");
    }
    return finish_with_state_status(wsi, state);
  }

  return 0;
}

/* Finalize parsing and send the final HTTP status response.
 *
 * lws_spa_finalize() gives the parser a chance to deliver the final file
 * callback. After that, completed tells us whether a file was actually stored.
 */
int
file_upload_complete(struct lws *wsi, struct file_upload_state **state)
{
  if (!state || !*state) {
    return send_status(wsi, HTTP_STATUS_BAD_REQUEST, "Upload has not been started");
  }

  if (lws_spa_finalize((*state)->spa) != 0) {
    if (!(*state)->failed) {
      file_upload_set_error(*state, HTTP_STATUS_BAD_REQUEST, "Invalid upload body");
    }
    return finish_with_state_status(wsi, state);
  }

  if ((*state)->failed) {
    return finish_with_state_status(wsi, state);
  }

  if (!(*state)->completed) {
    file_upload_set_error(*state, HTTP_STATUS_BAD_REQUEST, "No file was uploaded");
    return finish_with_state_status(wsi, state);
  }

  file_upload_destroy(state);

  return send_status(wsi, HTTP_STATUS_OK, "Upload complete");
}

/* Release upload state and remove any incomplete temporary file.
 *
 * This is used both after normal responses and from HTTP connection cleanup.
 * If the upload did not complete, the temporary file is removed.
 */
void
file_upload_destroy(struct file_upload_state **state)
{
  struct file_upload_state *upload = NULL;

  if (!state || !*state) {
    return;
  }

  upload = *state;
  *state = NULL;

  if (upload->spa) {
    lws_spa_destroy(upload->spa);
    upload->spa = NULL;
  }

  if (upload->fp) {
    fclose(upload->fp);
    upload->fp = NULL;
  }

  if (!upload->completed && upload->part_path[0] != '\0') {
    unlink(upload->part_path);
  }

  g_free(upload);
}
