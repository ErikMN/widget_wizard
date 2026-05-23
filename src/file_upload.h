#pragma once

#include <stdbool.h>
#include <stddef.h>

#include <libwebsockets.h>

struct file_upload_state;

/* HTTP multipart upload endpoint.
 *
 * ws_server.c owns routing and libwebsockets callbacks. This module owns the
 * upload parser state, file writing, size limit, filename cleanup, and cleanup
 * after failed or aborted uploads.
 */
bool file_upload_is_path(const char *uri, int uri_len);
int file_upload_start(struct lws *wsi, struct file_upload_state **state);
int file_upload_process_body(struct lws *wsi, struct file_upload_state **state, const void *in, size_t len);
int file_upload_complete(struct lws *wsi, struct file_upload_state **state);
void file_upload_destroy(struct file_upload_state **state);
