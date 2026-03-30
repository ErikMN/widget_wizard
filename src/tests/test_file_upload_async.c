#include "test_support.h"

#include "file_upload_async.h"

/* Maximum number of completion callbacks one async test records. */
#define MAX_ASYNC_COMPLETIONS 4

/* Per-test fixture for the asynchronous upload wrapper. */
struct file_upload_async_test_state {
  struct upload_test_file file;
  GMainContext *context;
  struct file_upload_async *upload_async;
  volatile size_t callback_count;
  struct file_upload_async_completion completions[MAX_ASYNC_COMPLETIONS];
};

/******************************************************************************/

/* Record one completion callback in fixture storage for later assertions. */
static void
record_async_completion(const struct file_upload_async_completion *completion, void *user_data)
{
  struct file_upload_async_test_state *test_state = user_data;

  assert_non_null(test_state);
  assert_non_null(completion);
  assert_true(test_state->callback_count < MAX_ASYNC_COMPLETIONS);
  test_state->completions[test_state->callback_count] = *completion;
  test_state->callback_count++;
}

/* Create one async upload helper bound to a dedicated GLib main context. */
static int
setup_file_upload_async_test(void **state)
{
  struct file_upload_async_test_state *test_state = g_new0(struct file_upload_async_test_state, 1);

  assert_non_null(test_state);
  test_support_make_unique_upload_file(&test_state->file, "async");
  test_support_remove_file_if_present(test_state->file.path);
  test_state->context = g_main_context_new();
  assert_non_null(test_state->context);
  test_state->upload_async = file_upload_async_new(test_state->context, record_async_completion, test_state);
  assert_non_null(test_state->upload_async);
  *state = test_state;
  return 0;
}

/* Shut down the shared worker and clean up any temporary /tmp artifacts. */
static int
teardown_file_upload_async_test(void **state)
{
  struct file_upload_async_test_state *test_state = *state;

  assert_non_null(test_state);
  file_upload_async_close(test_state->upload_async);
  file_upload_async_shutdown();
  while (g_main_context_pending(test_state->context)) {
    g_main_context_iteration(test_state->context, FALSE);
  }
  file_upload_async_unref(test_state->upload_async);
  g_main_context_unref(test_state->context);
  test_support_remove_file_if_present(test_state->file.path);
  g_free(test_state);
  return 0;
}

/******************************************************************************/

/* One begin/chunk/finish sequence should complete asynchronously and write the
 * decoded file to the final target path.
 */
static void
test_file_upload_async_writes_uploaded_file(void **state)
{
  struct file_upload_async_test_state *test_state = *state;
  static const char payload[] = "Hello";

  assert_int_equal(
      file_upload_async_submit_begin(
          test_state->upload_async, test_state->file.filename, strlen(test_state->file.filename), sizeof(payload) - 1),
      FILE_UPLOAD_ASYNC_SUBMIT_OK);
  test_support_wait_for_callback_count(test_state->context, &test_state->callback_count, 1, 1000000);
  assert_int_equal(test_state->completions[0].operation, FILE_UPLOAD_ASYNC_OP_BEGIN);
  assert_true(test_state->completions[0].succeeded);
  assert_int_equal(test_state->completions[0].expected_size_bytes, sizeof(payload) - 1);

  assert_int_equal(file_upload_async_submit_chunk(test_state->upload_async, "SGVsbG8=", strlen("SGVsbG8=")),
                   FILE_UPLOAD_ASYNC_SUBMIT_OK);
  test_support_wait_for_callback_count(test_state->context, &test_state->callback_count, 2, 1000000);
  assert_int_equal(test_state->completions[1].operation, FILE_UPLOAD_ASYNC_OP_APPEND_CHUNK);
  assert_true(test_state->completions[1].succeeded);
  assert_int_equal(test_state->completions[1].written_size_bytes, sizeof(payload) - 1);

  assert_int_equal(file_upload_async_submit_finish(test_state->upload_async), FILE_UPLOAD_ASYNC_SUBMIT_OK);
  test_support_wait_for_callback_count(test_state->context, &test_state->callback_count, 3, 1000000);
  assert_int_equal(test_state->completions[2].operation, FILE_UPLOAD_ASYNC_OP_FINISH);
  assert_true(test_state->completions[2].succeeded);
  assert_true(test_state->completions[2].result.ok);
  assert_string_equal(test_state->completions[2].result.filename, test_state->file.filename);
  assert_string_equal(test_state->completions[2].result.path, test_state->file.path);
  test_support_assert_file_contents(test_state->file.path, payload, sizeof(payload) - 1);
}

/* Submitting a second operation before the current one completes should
 * report FILE_UPLOAD_ASYNC_SUBMIT_BUSY.
 */
static void
test_file_upload_async_rejects_parallel_submit(void **state)
{
  struct file_upload_async_test_state *test_state = *state;

  assert_int_equal(file_upload_async_submit_begin(
                       test_state->upload_async, test_state->file.filename, strlen(test_state->file.filename), 5),
                   FILE_UPLOAD_ASYNC_SUBMIT_OK);
  assert_int_equal(file_upload_async_submit_finish(test_state->upload_async), FILE_UPLOAD_ASYNC_SUBMIT_BUSY);
  test_support_wait_for_callback_count(test_state->context, &test_state->callback_count, 1, 1000000);
  assert_true(test_state->completions[0].succeeded);
}

/* Closing the async helper should reject future submissions immediately. */
static void
test_file_upload_async_rejects_submit_after_close(void **state)
{
  struct file_upload_async_test_state *test_state = *state;

  file_upload_async_close(test_state->upload_async);
  assert_int_equal(file_upload_async_submit_begin(
                       test_state->upload_async, test_state->file.filename, strlen(test_state->file.filename), 5),
                   FILE_UPLOAD_ASYNC_SUBMIT_CLOSED);
  assert_int_equal(test_state->callback_count, 0);
}

/* Invalid chunk data should surface as an async error and leave the previous
 * completed destination file untouched.
 */
static void
test_file_upload_async_invalid_chunk_keeps_previous_file(void **state)
{
  struct file_upload_async_test_state *test_state = *state;
  static const char previous_payload[] = "stable";

  test_support_write_file(test_state->file.path, previous_payload, sizeof(previous_payload) - 1);

  assert_int_equal(file_upload_async_submit_begin(
                       test_state->upload_async, test_state->file.filename, strlen(test_state->file.filename), 5),
                   FILE_UPLOAD_ASYNC_SUBMIT_OK);
  test_support_wait_for_callback_count(test_state->context, &test_state->callback_count, 1, 1000000);
  assert_true(test_state->completions[0].succeeded);
  assert_true(test_state->completions[0].overwritten);

  assert_int_equal(file_upload_async_submit_chunk(test_state->upload_async, "%%%=", strlen("%%%=")),
                   FILE_UPLOAD_ASYNC_SUBMIT_OK);
  test_support_wait_for_callback_count(test_state->context, &test_state->callback_count, 2, 1000000);
  assert_int_equal(test_state->completions[1].operation, FILE_UPLOAD_ASYNC_OP_APPEND_CHUNK);
  assert_false(test_state->completions[1].succeeded);
  assert_false(test_state->completions[1].result.ok);
  assert_string_equal(test_state->completions[1].result.error_type, "invalid_upload_content");
  test_support_assert_file_contents(test_state->file.path, previous_payload, sizeof(previous_payload) - 1);
}

/******************************************************************************/

int
main(void)
{
  const struct CMUnitTest tests[] = {
    cmocka_unit_test_setup_teardown(
        test_file_upload_async_writes_uploaded_file, setup_file_upload_async_test, teardown_file_upload_async_test),
    cmocka_unit_test_setup_teardown(
        test_file_upload_async_rejects_parallel_submit, setup_file_upload_async_test, teardown_file_upload_async_test),
    cmocka_unit_test_setup_teardown(test_file_upload_async_rejects_submit_after_close,
                                    setup_file_upload_async_test,
                                    teardown_file_upload_async_test),
    cmocka_unit_test_setup_teardown(test_file_upload_async_invalid_chunk_keeps_previous_file,
                                    setup_file_upload_async_test,
                                    teardown_file_upload_async_test),
  };

  return cmocka_run_group_tests(tests, NULL, NULL);
}
