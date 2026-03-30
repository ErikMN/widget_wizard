#pragma once

#include <errno.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#include <cmocka.h>
#include <glib.h>

#include "file_upload.h"

/* Small shared fixture state for upload tests that write to /tmp. */
struct upload_test_file {
  char filename[MAX_UPLOAD_FILENAME_LENGTH + 1];
  char path[MAX_UPLOAD_PATH_LENGTH];
};

/* Build one unique filename/path pair below FILE_UPLOAD_TARGET_DIR.
 *
 * Tests share the real /tmp upload directory with the backend code, so each
 * test instance uses a unique basename and cleans it up explicitly.
 */
static inline void
test_support_make_unique_upload_file(struct upload_test_file *file, const char *tag)
{
  static unsigned int sequence = 0;

  assert_non_null(file);
  assert_non_null(tag);

  sequence++;
  snprintf(file->filename,
           sizeof(file->filename),
           "widget_wizard-%s-%ld-%llu-%u.bin",
           tag,
           (long)getpid(),
           (unsigned long long)g_get_monotonic_time(),
           sequence);
  snprintf(file->path, sizeof(file->path), "%s/%s", FILE_UPLOAD_TARGET_DIR, file->filename);
}

/* Remove one test file path if it exists. */
static inline void
test_support_remove_file_if_present(const char *path)
{
  if (!path || path[0] == '\0') {
    return;
  }

  unlink(path);
}

/* Read one file and compare it to the expected byte buffer. */
static inline void
test_support_assert_file_contents(const char *path, const void *expected, size_t expected_size)
{
  gchar *contents = NULL;
  gsize contents_size = 0;
  GError *error = NULL;

  assert_non_null(path);
  assert_non_null(expected);
  assert_true(g_file_get_contents(path, &contents, &contents_size, &error));
  assert_null(error);
  assert_int_equal(contents_size, expected_size);
  assert_memory_equal(contents, expected, expected_size);
  g_free(contents);
}

/* Write one full file so overwrite behavior can be tested deterministically. */
static inline void
test_support_write_file(const char *path, const void *contents, size_t contents_size)
{
  GError *error = NULL;

  assert_non_null(path);
  assert_non_null(contents);
  assert_true(g_file_set_contents(path, contents, (gssize)contents_size, &error));
  assert_null(error);
}

/* Verify that a test file path does not exist. */
static inline void
test_support_assert_file_missing(const char *path)
{
  assert_non_null(path);
  assert_int_equal(access(path, F_OK), -1);
  assert_int_equal(errno, ENOENT);
}

/* Drive one GLib main context until the requested callback count is reached. */
static inline void
test_support_wait_for_callback_count(GMainContext *context,
                                     volatile size_t *callback_count,
                                     size_t expected_count,
                                     gint64 timeout_us)
{
  gint64 deadline = g_get_monotonic_time() + timeout_us;

  assert_non_null(context);
  assert_non_null(callback_count);

  while (*callback_count < expected_count && g_get_monotonic_time() < deadline) {
    if (!g_main_context_iteration(context, FALSE)) {
      g_usleep(1000);
    }
  }

  assert_true(*callback_count >= expected_count);
}
