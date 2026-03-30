#include "test_support.h"

/* Per-test fixture for the synchronous upload module. */
struct file_upload_test_state {
  struct upload_test_file file;
  struct file_upload_state upload;
};

/******************************************************************************/

/* Reset one upload fixture and remove any leftover output file. */
static int
setup_file_upload_test(void **state)
{
  struct file_upload_test_state *test_state = g_new0(struct file_upload_test_state, 1);

  assert_non_null(test_state);
  test_support_make_unique_upload_file(&test_state->file, "sync");
  test_support_remove_file_if_present(test_state->file.path);
  file_upload_reset_state(&test_state->upload);
  *state = test_state;
  return 0;
}

/* Clean up the active upload state and the final file written by the test. */
static int
teardown_file_upload_test(void **state)
{
  struct file_upload_test_state *test_state = *state;

  assert_non_null(test_state);
  file_upload_abort(&test_state->upload);
  test_support_remove_file_if_present(test_state->file.path);
  g_free(test_state);
  return 0;
}

/******************************************************************************/

/* One complete begin/chunk/finish flow should store the decoded file in /tmp. */
static void
test_file_upload_writes_uploaded_file(void **state)
{
  struct file_upload_test_state *test_state = *state;
  struct file_upload_result result;
  static const char payload[] = "Hello";

  assert_true(file_upload_begin(
      &test_state->upload, test_state->file.filename, strlen(test_state->file.filename), sizeof(payload) - 1, &result));
  assert_true(file_upload_append_base64_chunk(&test_state->upload, "SGVsbG8=", strlen("SGVsbG8="), &result));
  file_upload_finish(&test_state->upload, &result);

  assert_true(result.ok);
  assert_false(result.overwritten);
  assert_int_equal(result.size_bytes, sizeof(payload) - 1);
  assert_string_equal(result.filename, test_state->file.filename);
  assert_string_equal(result.path, test_state->file.path);
  assert_false(test_state->upload.active);
  test_support_assert_file_contents(test_state->file.path, payload, sizeof(payload) - 1);
}

/* Invalid filenames should be rejected before the upload session starts. */
static void
test_file_upload_rejects_path_separator(void **state)
{
  struct file_upload_test_state *test_state = *state;
  struct file_upload_result result;
  const char *invalid_name = "bad/name.bin";

  assert_false(file_upload_begin(&test_state->upload, invalid_name, strlen(invalid_name), 4, &result));
  assert_false(result.ok);
  assert_false(test_state->upload.active);
  assert_string_equal(result.error_type, "invalid_upload_filename");
}

/******************************************************************************/

int
main(void)
{
  const struct CMUnitTest tests[] = {
    cmocka_unit_test_setup_teardown(
        test_file_upload_writes_uploaded_file, setup_file_upload_test, teardown_file_upload_test),
    cmocka_unit_test_setup_teardown(
        test_file_upload_rejects_path_separator, setup_file_upload_test, teardown_file_upload_test),
  };

  return cmocka_run_group_tests(tests, NULL, NULL);
}
