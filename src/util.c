#include "util.h"

/* Return time in milliseconds for the given clock.
 *
 * Supported clocks:
 * - CLOCK_REALTIME:
 *     Wall-clock time since the Unix epoch (UTC).
 *     Subject to adjustments (NTP, manual clock changes).
 *     Suitable for timestamps shown to users or correlating with external systems.
 *
 * - CLOCK_MONOTONIC:
 *     Monotonic time since an unspecified starting point (typically boot).
 *     Not subject to wall-clock adjustments.
 *     Suitable for measuring time deltas and intervals.
 *
 * On failure, returns 0
 */
uint64_t
get_time_ms(clockid_t clk_id)
{
  struct timespec ts;

  if (clock_gettime(clk_id, &ts) != 0) {
    return 0;
  }

  /* Convert seconds + nanoseconds to milliseconds */
  return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;
}
