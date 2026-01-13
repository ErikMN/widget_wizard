#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <sys/types.h>

struct per_session_data;

/* Maximum process name length accepted from clients (stored as NUL-terminated string).
 *
 * This is compared against /proc/<pid>/comm, which is typically limited (e.g. 16 chars),
 * but we allow extra headroom for robustness and client-side convenience.
 */
#define MAX_PROC_NAME_LENGTH 64

/* Maximum number of unique process names returned in a single list response.
 *
 * This bounds:
 * - /proc scan result size (deduped by /proc/<pid>/comm)
 * - JSON construction time
 * - worst-case payload size sent to the client
 *
 * The UI uses this list for interactive discovery/filtering, not as a full
 * process inventory. If more than MAX_PROCESS_COUNT unique names exist,
 * the list is truncated.
 */
#define MAX_PROCESS_COUNT 256

/* Maximum length of a /proc/<pid>/comm path.
 *
 * Example: "/proc/123456/comm"
 * Sized conservatively to allow for future path changes without risking buffer overflow.
 */
#define MAX_PROC_PATH_LENGTH 256

/* Read CPU and memory usage for a named process.
 *
 * - Matches the first /proc/<pid>/comm equal to proc_name.
 * - CPU usage is computed from utime + stime deltas over monotonic time.
 * - Memory usage is reported as VmRSS in kB.
 *
 * Returns true on success, false if the process was not found or data
 * could not be read. On failure, outputs are set to 0.
 */
bool read_process_stats(const char *proc_name,
                        struct per_session_data *pss,
                        uint64_t now_mono_ms,
                        double *cpu_out,
                        long *rss_kb_out,
                        long *pss_kb_out,
                        long *uss_kb_out,
                        pid_t *pid_out);

/* Collect a unique list of running process names from /proc.
 *
 * Implementation details:
 * - Enumerates numeric /proc/<pid> directories.
 * - Reads /proc/<pid>/comm to obtain the process name.
 * - Skips kernel threads (names enclosed in '[...]').
 * - Deduplicates process names to avoid listing multiple PIDs
 *   belonging to the same executable.
 * - Stops when max_names entries have been collected.
 *
 * Performance:
 * - This function performs a linear scan of /proc and opens
 *   one small text file per PID.
 * - It is intentionally NOT called periodically or from a timer.
 * - It is executed only on explicit client request (one-shot),
 *   making occasional CPU spikes acceptable and bounded.
 *
 * Rationale:
 * - Using /proc/<pid>/comm provides a stable, short process name
 *   that is readable without elevated privileges.
 * - The returned list is intended for interactive UI discovery,
 *   not continuous monitoring.
 *
 * Returns:
 * - Number of unique process names written to the output array.
 * - Returns 0 on failure or if no processes are found.
 */
size_t collect_process_list(char names[][64], size_t max_names);
