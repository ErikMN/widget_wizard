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
