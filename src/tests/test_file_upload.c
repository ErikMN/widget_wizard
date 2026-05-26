/* File upload host tests.
 *
 * These tests start the real backend server on a loopback port and send plain
 * HTTP requests from a small client thread. The test thread drives the GLib
 * main context so libwebsockets can process the request.
 */
#include "test_support.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/stat.h>

#include "app_state.h"
#include "ws_server.h"

#define TEST_UPLOAD_DIR "/tmp/widget_wizard_uploads"
#define TEST_UPLOAD_PATH "/tmp/widget_wizard_uploads/widget_wizard_upload_test.txt"
#define TEST_UPLOAD_FILENAME "widget_wizard_upload_test.txt"
#define TEST_UPLOAD_DIR_MODE 0755
#define TEST_UPLOAD_FILE_MODE 0644
#define TEST_DIRECT_UPLOAD_ROUTE "/file-upload"
#define TEST_PROXIED_UPLOAD_ROUTE "/local/widget_wizard/file-upload"
#define TEST_BOUNDARY "widgetwizardtestboundary"
#define TEST_TIMEOUT_US (5 * G_TIME_SPAN_SECOND)

/* Request data shared between the test thread and the client thread. */
struct http_client_request {
  int port;
  const char *path;
  const char *content_type;
  const char *body;
  size_t body_len;
  int status;
  char response[1024];
  volatile bool done;
};

/* Assert only the permission bits that are relevant to local readers. */
static void
assert_path_mode(const char *path, mode_t expected_mode)
{
  struct stat st;

  assert_int_equal(stat(path, &st), 0);
  assert_int_equal(st.st_mode & 0777, expected_mode);
}

/* Ask the OS for an unused loopback port for one test server instance. */
static int
get_free_loopback_port(void)
{
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in addr;
  socklen_t addr_len = sizeof(addr);
  int port;

  assert_true(fd >= 0);

  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = 0;

  assert_int_equal(bind(fd, (struct sockaddr *)&addr, sizeof(addr)), 0);
  assert_int_equal(getsockname(fd, (struct sockaddr *)&addr, &addr_len), 0);

  port = ntohs(addr.sin_port);
  close(fd);

  return port;
}

/* send() can write only part of the buffer, so loop until all bytes are sent. */
static bool
send_all(int fd, const char *buf, size_t len)
{
  size_t sent = 0;

  while (sent < len) {
    ssize_t n = send(fd, buf + sent, len - sent, 0);
    if (n <= 0) {
      return false;
    }
    sent += (size_t)n;
  }

  return true;
}

/* Extract the numeric status from the first HTTP response line. */
static int
parse_http_status(const char *response)
{
  int status = -1;

  if (response) {
    sscanf(response, "HTTP/%*s %d", &status);
  }

  return status;
}

/* Send one HTTP request while the test thread drives the backend event loop.
 *
 * The backend and libwebsockets run in the GLib main context. If this client
 * ran on the same thread, connect(), send(), and recv() would block the server
 * from processing the request.
 */
static gpointer
http_client_thread(gpointer data)
{
  struct http_client_request *request = data;
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in addr;
  GString *http = NULL;
  size_t response_len = 0;

  if (fd < 0) {
    request->status = -1;
    request->done = true;
    return NULL;
  }

  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = htons((uint16_t)request->port);

  if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
    close(fd);
    request->status = -1;
    request->done = true;
    return NULL;
  }

  /* Build a minimal HTTP request by hand so the test has no curl dependency. */
  http = g_string_new(NULL);
  g_string_append_printf(http,
                         "POST %s HTTP/1.1\r\n"
                         "Host: 127.0.0.1\r\n"
                         "Content-Type: %s\r\n"
                         "Content-Length: %zu\r\n"
                         "Connection: close\r\n"
                         "\r\n",
                         request->path,
                         request->content_type,
                         request->body_len);
  if (!send_all(fd, http->str, http->len) || !send_all(fd, request->body, request->body_len)) {
    g_string_free(http, TRUE);
    close(fd);
    request->status = -1;
    request->done = true;
    return NULL;
  }
  g_string_free(http, TRUE);

  for (;;) {
    ssize_t n = recv(fd, request->response + response_len, sizeof(request->response) - response_len - 1, 0);
    if (n <= 0) {
      break;
    }

    response_len += (size_t)n;
    if (response_len + 1 >= sizeof(request->response)) {
      break;
    }
  }

  request->response[response_len] = '\0';
  request->status = parse_http_status(request->response);
  close(fd);

  /* done is polled by the test thread while it services the GLib context. */
  request->done = true;
  return NULL;
}

/* Run the client request and service libwebsockets until the response arrives. */
static void
run_http_request(struct http_client_request *request)
{
  GThread *thread = g_thread_new("upload-test-client", http_client_thread, request);
  gint64 deadline = g_get_monotonic_time() + TEST_TIMEOUT_US;
  GMainContext *context = g_main_context_default();

  while (!request->done && g_get_monotonic_time() < deadline) {
    if (!g_main_context_iteration(context, FALSE)) {
      g_usleep(1000);
    }
  }

  assert_true(request->done);
  g_thread_join(thread);
}

/* Build the multipart body expected by file_upload.c.
 *
 * The field name is intentionally hardcoded to "file" because that is the
 * public upload contract.
 */
static char *
build_multipart_body(const char *filename, const char *content, size_t content_len, size_t *body_len)
{
  GString *body = g_string_new(NULL);

  g_string_append_printf(body,
                         "--%s\r\n"
                         "Content-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
                         "Content-Type: application/octet-stream\r\n"
                         "\r\n",
                         TEST_BOUNDARY,
                         filename);
  g_string_append_len(body, content, (gssize)content_len);
  g_string_append_printf(body, "\r\n--%s--\r\n", TEST_BOUNDARY);

  *body_len = body->len;
  return g_string_free(body, FALSE);
}

/* Successful upload: the backend stores the uploaded file in /tmp. */
static void
test_upload_stores_file(void **state)
{
  (void)state;

  struct app_state app;
  struct http_client_request request;
  const char payload[] = "hello upload\n";
  size_t body_len = 0;
  char *body = build_multipart_body(TEST_UPLOAD_FILENAME, payload, strlen(payload), &body_len);
  int port = get_free_loopback_port();

  memset(&app, 0, sizeof(app));
  memset(&request, 0, sizeof(request));
  assert_int_equal(g_mkdir_with_parents(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE), 0);
  assert_int_equal(chmod(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE), 0);
  unlink(TEST_UPLOAD_PATH);

  assert_true(ws_server_start(&app, port));

  /* Use the same multipart Content Type shape a browser form would send. */
  request.port = port;
  request.path = TEST_DIRECT_UPLOAD_ROUTE;
  request.content_type = "multipart/form-data; boundary=" TEST_BOUNDARY;
  request.body = body;
  request.body_len = body_len;
  request.status = -1;

  run_http_request(&request);
  ws_server_stop();

  assert_int_equal(request.status, 200);
  assert_int_equal(access(TEST_UPLOAD_PATH, F_OK), 0);
  assert_path_mode(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE);
  assert_path_mode(TEST_UPLOAD_PATH, TEST_UPLOAD_FILE_MODE);

  /* Check the file contents, not only the HTTP status. */
  FILE *fp = fopen(TEST_UPLOAD_PATH, "rb");
  assert_non_null(fp);
  char read_buf[sizeof(payload)];
  assert_int_equal(fread(read_buf, 1, strlen(payload), fp), strlen(payload));
  fclose(fp);
  assert_memory_equal(read_buf, payload, strlen(payload));

  unlink(TEST_UPLOAD_PATH);
  g_free(body);
}

/* Successful upload through the packaged web route. */
static void
test_upload_accepts_proxied_path(void **state)
{
  (void)state;

  struct app_state app;
  struct http_client_request request;
  const char payload[] = "hello proxy upload\n";
  size_t body_len = 0;
  char *body = build_multipart_body(TEST_UPLOAD_FILENAME, payload, strlen(payload), &body_len);
  int port = get_free_loopback_port();

  memset(&app, 0, sizeof(app));
  memset(&request, 0, sizeof(request));
  assert_int_equal(g_mkdir_with_parents(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE), 0);
  assert_int_equal(chmod(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE), 0);
  unlink(TEST_UPLOAD_PATH);

  assert_true(ws_server_start(&app, port));

  request.port = port;
  request.path = TEST_PROXIED_UPLOAD_ROUTE;
  request.content_type = "multipart/form-data; boundary=" TEST_BOUNDARY;
  request.body = body;
  request.body_len = body_len;
  request.status = -1;

  run_http_request(&request);
  ws_server_stop();

  assert_int_equal(request.status, 200);
  assert_int_equal(access(TEST_UPLOAD_PATH, F_OK), 0);
  assert_path_mode(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE);
  assert_path_mode(TEST_UPLOAD_PATH, TEST_UPLOAD_FILE_MODE);

  unlink(TEST_UPLOAD_PATH);
  g_free(body);
}

/* Rejected upload: the shared upload directory must not be writable by others. */
static void
test_upload_rejects_unsafe_upload_dir(void **state)
{
  (void)state;

  struct app_state app;
  struct http_client_request request;
  const char payload[] = "unsafe directory\n";
  size_t body_len = 0;
  char *body = build_multipart_body(TEST_UPLOAD_FILENAME, payload, strlen(payload), &body_len);
  int port = get_free_loopback_port();

  memset(&app, 0, sizeof(app));
  memset(&request, 0, sizeof(request));
  assert_int_equal(g_mkdir_with_parents(TEST_UPLOAD_DIR, 0700), 0);
  assert_int_equal(chmod(TEST_UPLOAD_DIR, 0777), 0);
  unlink(TEST_UPLOAD_PATH);

  assert_true(ws_server_start(&app, port));

  request.port = port;
  request.path = TEST_DIRECT_UPLOAD_ROUTE;
  request.content_type = "multipart/form-data; boundary=" TEST_BOUNDARY;
  request.body = body;
  request.body_len = body_len;
  request.status = -1;

  run_http_request(&request);
  ws_server_stop();

  assert_int_equal(request.status, 500);
  assert_int_equal(chmod(TEST_UPLOAD_DIR, TEST_UPLOAD_DIR_MODE), 0);

  unlink(TEST_UPLOAD_PATH);
  g_free(body);
}

/* Rejected upload: overlong cleaned filenames must not be truncated. */
static void
test_upload_rejects_overlong_filename(void **state)
{
  (void)state;

  struct app_state app;
  struct http_client_request request;
  const char payload[] = "bad filename\n";
  GString *filename = g_string_new(NULL);
  size_t body_len = 0;
  char *body;
  int port = get_free_loopback_port();

  /* This exceeds FILE_UPLOAD_MAX_FILENAME_LENGTH after cleanup. */
  for (size_t i = 0; i < 160; i++) {
    g_string_append_c(filename, 'a');
  }
  g_string_append(filename, ".txt");

  body = build_multipart_body(filename->str, payload, strlen(payload), &body_len);

  memset(&app, 0, sizeof(app));
  memset(&request, 0, sizeof(request));

  assert_true(ws_server_start(&app, port));

  request.port = port;
  request.path = TEST_DIRECT_UPLOAD_ROUTE;
  request.content_type = "multipart/form-data; boundary=" TEST_BOUNDARY;
  request.body = body;
  request.body_len = body_len;
  request.status = -1;

  run_http_request(&request);
  ws_server_stop();

  assert_int_equal(request.status, 400);

  g_free(body);
  g_string_free(filename, TRUE);
}

int
main(void)
{
  const struct CMUnitTest tests[] = {
    cmocka_unit_test(test_upload_stores_file),
    cmocka_unit_test(test_upload_accepts_proxied_path),
    cmocka_unit_test(test_upload_rejects_unsafe_upload_dir),
    cmocka_unit_test(test_upload_rejects_overlong_filename),
  };

  return cmocka_run_group_tests(tests, NULL, NULL);
}
