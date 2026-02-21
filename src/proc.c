#include <stdio.h>
#include <stdlib.h>
#include <dirent.h>
#include <string.h>
#include <unistd.h>
#include <syslog.h>

#include "session.h"
#include "proc.h"
#include "stats.h"

static long cpu_core_count = 1;

/* Cache the number of online CPUs once.
 *
 * The value is constant for the lifetime of the process on typical
 * embedded systems, so caching avoids repeated sysconf() calls.
 * Fallback to 1 ensures safe division if sysconf() fails.
 */
void
proc_init_cpu_count(void)
{
  cpu_core_count = sysconf(_SC_NPROCESSORS_ONLN);
  if (cpu_core_count <= 0) {
    syslog(LOG_WARNING, "sysconf(_SC_NPROCESSORS_ONLN) failed, defaulting to 1 CPU");
    cpu_core_count = 1;
  }
  syslog(LOG_INFO, "Detected %ld CPU core(s)", cpu_core_count);
}

/* Return CPU core count. */
long
proc_get_cpu_core_count(void)
{
  return cpu_core_count;
}

/* Verify that a cached PID still belongs to the given process name.
 *
 * This protects against Linux PID reuse: a different process may reuse
 * the same PID after the original process exits.
 *
 * Returns true if /proc/<pid>/comm exists and matches proc_name.
 */
static bool
pid_matches_comm(pid_t pid, const char *proc_name)
{
  char path[MAX_PROC_PATH_LENGTH];
  char buf[MAX_PROC_LINE_LENGTH];

  if (pid <= 0 || !proc_name || proc_name[0] == '\0') {
    return false;
  }

  snprintf(path, sizeof(path), "/proc/%d/comm", pid);
  FILE *f = fopen(path, "r");
  if (!f) {
    return false;
  }

  if (!fgets(buf, sizeof(buf), f)) {
    fclose(f);
    return false;
  }
  fclose(f);

  /* Strip trailing newline */
  buf[strcspn(buf, "\n")] = '\0';

  return strcmp(buf, proc_name) == 0;
}

/* Find the first PID whose /proc/<pid>/comm matches proc_name.
 *
 * Returns PID (>0) on success, 0 if not found.
 */
static pid_t
find_pid_by_comm(const char *proc_name)
{
  DIR *proc_dir = NULL;
  struct dirent *ent; /* Directory entry used when iterating over /proc */
  char path[MAX_PROC_PATH_LENGTH];
  char buf[MAX_PROC_LINE_LENGTH];

  if (!proc_name || proc_name[0] == '\0') {
    return 0;
  }

  /* Open /proc to iterate over all running processes, return empty result on failure */
  proc_dir = opendir("/proc");
  if (!proc_dir) {
    return 0;
  }

  /* Iterate all /proc entries (numeric directories correspond to PIDs) */
  while ((ent = readdir(proc_dir)) != NULL) {
    /* /proc on some filesystems may not reliably report d_type, so accept DT_UNKNOWN too */
    if (ent->d_type != DT_DIR && ent->d_type != DT_UNKNOWN) {
      continue;
    }

    /* Only consider numeric /proc entries (PIDs)
     * skip non-numeric names and invalid or non-positive values
     */
    char *endptr = NULL;
    long pid = strtol(ent->d_name, &endptr, 10);
    if (*ent->d_name == '\0' || *endptr != '\0' || pid <= 0) {
      continue;
    }

    /* Read the process name from /proc/<pid>/comm
     * skip entries that disappear or cannot be opened
     */
    snprintf(path, sizeof(path), "/proc/%ld/comm", pid);
    FILE *f = fopen(path, "r");
    if (!f) {
      continue;
    }

    /* Read one line (process name) and ignore processes that exit mid-read */
    if (!fgets(buf, sizeof(buf), f)) {
      fclose(f);
      continue;
    }
    fclose(f);

    /* Strip trailing newline from /proc/<pid>/comm so buf is a clean NUL-terminated name */
    buf[strcspn(buf, "\n")] = '\0';

    /* Skip kernel threads: in /proc/<pid>/comm they typically appear as "[kthread-name]" */
    if (buf[0] == '[') {
      continue;
    }
    /* Match the requested process name */
    if (strcmp(buf, proc_name) == 0) {
      /* Release the /proc directory handle before returning to avoid leaking an fd */
      closedir(proc_dir);
      return (pid_t)pid;
    }
  }
  /* Release the /proc directory handle before returning to avoid leaking an fd */
  closedir(proc_dir);

  return 0;
}

/* Parse utime and stime from /proc/<pid>/stat safely.
 *
 * /proc/<pid>/stat format:
 *   pid (comm with spaces and ')') state ppid pgrp session ...
 *
 * The comm field is enclosed in parentheses and may contain ')', so
 * we must locate the *closing* ") " sequence that precedes the state
 * field, not the last ')'.
 *
 * Returns true on success.
 */
static bool
parse_proc_stat_times(const char *line, unsigned long long *utime_out, unsigned long long *stime_out)
{
  const char *p;
  const char *end = NULL;

  if (!line || !utime_out || !stime_out) {
    return false;
  }

  /* Find the opening '(' */
  p = strchr(line, '(');
  if (!p) {
    return false;
  }
  /* Find the closing ')' that is followed by " <state> " */
  for (const char *q = p + 1; *q; q++) {
    if (q[0] == ')' && q[1] == ' ' && q[2] != '\0' && q[3] == ' ') {
      /* Validate that q[2] is a Linux task state letter */
      if (strchr("RSDZTtWXxKPI", q[2]) != NULL) {
        end = q;
        break;
      }
    }
  }
  /* Invalid /proc/<pid>/stat format */
  if (!end) {
    return false;
  }
  /* Move to the state field */
  p = end + 2;

  /* We are now at: state ppid pgrp session tty_nr tpgid flags minflt cminflt majflt cmajflt utime stime */
  char state;
  unsigned long long dummy;
  unsigned long long utime, stime;

  int scanned = sscanf(p,
                       "%c "
                       "%llu %llu %llu %llu %llu "
                       "%llu %llu %llu %llu %llu "
                       "%llu %llu",
                       &state,
                       &dummy, /* ppid */
                       &dummy, /* pgrp */
                       &dummy, /* session */
                       &dummy, /* tty_nr */
                       &dummy, /* tpgid */
                       &dummy, /* flags */
                       &dummy, /* minflt */
                       &dummy, /* cminflt */
                       &dummy, /* majflt */
                       &dummy, /* cmajflt */
                       &utime,
                       &stime);
  if (scanned != 13) {
    return false;
  }
  *utime_out = utime;
  *stime_out = stime;

  return true;
}

/* Read CPU and memory usage for a named process.
 *
 * - Matches the first /proc/<pid>/comm equal to proc_name.
 * - CPU usage is computed from utime + stime deltas over monotonic time.
 * - Memory usage is reported as VmRSS in kB.
 *
 * Returns true on success, false if the process was not found or data
 * could not be read. On failure, outputs are set to 0.
 */
bool
read_process_stats(const char *proc_name,
                   struct per_session_data *pss,
                   uint64_t now_mono_ms,
                   double *cpu_out,
                   long *rss_kb_out,
                   long *pss_kb_out,
                   long *uss_kb_out,
                   pid_t *pid_out)
{
  pid_t pid = -1;
  char path[MAX_PROC_PATH_LENGTH];
  char buf[MAX_PROC_LINE_LENGTH];

  unsigned long long utime = 0;
  unsigned long long stime = 0;
  long rss_kb = 0;

  const long clk_tck = sysconf(_SC_CLK_TCK);

  if (!proc_name || !pss || !cpu_out || !rss_kb_out || !pss_kb_out || !uss_kb_out || clk_tck <= 0) {
    return false;
  }

  if (pid_out) {
    *pid_out = 0;
  }
  *cpu_out = 0.0;
  *rss_kb_out = 0;
  *pss_kb_out = 0;
  *uss_kb_out = 0;

  /* Find PID by scanning /proc */
  if (pss->proc_pid == 0) {
    pss->proc_pid = find_pid_by_comm(proc_name);
  } else {
    /* Guard against Linux PID reuse */
    if (!pid_matches_comm(pss->proc_pid, proc_name)) {
      pss->proc_pid = 0;
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      pss->proc_pid = find_pid_by_comm(proc_name);
    }
  }
  pid = pss->proc_pid;

  if (pid_out) {
    *pid_out = pid;
  }

  if (pid <= 0) {
    /* Process not found */
    if (pid_out) {
      *pid_out = 0;
    }
    pss->prev_proc_utime = 0;
    pss->prev_proc_stime = 0;
    pss->prev_proc_sample_mono_ms = 0;
    pss->proc_pid = 0;
    return false;
  }
  /* Read /proc/<pid>/stat */
  snprintf(path, sizeof(path), "/proc/%d/stat", pid);
  FILE *statf = fopen(path, "r");
  if (!statf) {
    pss->proc_pid = 0;
    pss->prev_proc_utime = 0;
    pss->prev_proc_stime = 0;
    pss->prev_proc_sample_mono_ms = 0;
    return false;
  }

  char line[MAX_PROC_LINE_LENGTH];

  if (!fgets(line, sizeof(line), statf)) {
    fclose(statf);
    return false;
  }
  fclose(statf);

  if (!parse_proc_stat_times(line, &utime, &stime)) {
    /* Malformed or unexpected /proc/<pid>/stat
     * Reset baseline to avoid bogus deltas
     */
    pss->prev_proc_utime = 0;
    pss->prev_proc_stime = 0;
    pss->prev_proc_sample_mono_ms = 0;
    pss->proc_pid = 0;
    return false;
  }

  /* Read VmRSS from /proc/<pid>/status */
  snprintf(path, sizeof(path), "/proc/%d/status", pid);
  FILE *statusf = fopen(path, "r");
  if (statusf) {
    /* Scan /proc/<pid>/status for the VmRSS field to obtain the memory usage */
    while (fgets(buf, sizeof(buf), statusf)) {
      if (sscanf(buf, "VmRSS: %ld kB", &rss_kb) == 1) {
        break;
      }
    }
    fclose(statusf);
  }

  long pss_kb = 0;
  long uss_kb = 0;

  /* Read memory accounting from /proc/<pid>/smaps_rollup.
   *
   * smaps_rollup provides per-process memory totals aggregated over all VMAs.
   *
   * - PSS (Proportional Set Size):
   *     Kernel-accounted RAM cost of the process (shared pages divided among
   *     their users). Unlike RSS, PSS is additive across processes.
   *
   * - USS (Unique Set Size):
   *     Best-effort estimate of memory that would be freed if the process exited.
   *     Computed as the sum of all "Private_*" categories in kB:
   *       USS = Private_Clean + Private_Dirty + Private_Hugetlb + Private_Shmem
   *
   * NOTE:
   * - smaps_rollup may be unavailable on older kernels or restricted by permissions.
   *   In that case, pss_kb and uss_kb remain 0 and RSS from /proc/<pid>/status is used.
   */
  snprintf(path, sizeof(path), "/proc/%d/smaps_rollup", pid);
  FILE *smaps = fopen(path, "r");
  if (smaps) {
    while (fgets(buf, sizeof(buf), smaps)) {
      long v;
      if (sscanf(buf, "Pss: %ld kB", &v) == 1) {
        pss_kb = v;
      } else if (sscanf(buf, "Private_Clean: %ld kB", &v) == 1) {
        uss_kb += v;
      } else if (sscanf(buf, "Private_Dirty: %ld kB", &v) == 1) {
        uss_kb += v;
      } else if (sscanf(buf, "Private_Hugetlb: %ld kB", &v) == 1) {
        uss_kb += v;
      } else if (sscanf(buf, "Private_Shmem: %ld kB", &v) == 1) {
        uss_kb += v;
      }
    }
    fclose(smaps);
  }

  /* First sample: establish baseline */
  if (pss->prev_proc_sample_mono_ms == 0) {
    pss->prev_proc_utime = utime;
    pss->prev_proc_stime = stime;
    pss->prev_proc_sample_mono_ms = now_mono_ms;
    *rss_kb_out = rss_kb;
    *pss_kb_out = pss_kb;
    *uss_kb_out = uss_kb;
    return true;
  }

  /* Compute deltas */
  unsigned long long prev_total = pss->prev_proc_utime + pss->prev_proc_stime;
  unsigned long long curr_total = utime + stime;

  if (curr_total < prev_total || now_mono_ms <= pss->prev_proc_sample_mono_ms) {
    /* Process restarted or clock anomaly */
    pss->prev_proc_utime = utime;
    pss->prev_proc_stime = stime;
    pss->prev_proc_sample_mono_ms = now_mono_ms;
    *rss_kb_out = rss_kb;
    *pss_kb_out = pss_kb;
    *uss_kb_out = uss_kb;
    return true;
  }

  /* Compute CPU time delta (in jiffies) and elapsed wall time (in seconds) since last sample */
  unsigned long long delta_jiffies = curr_total - prev_total;
  double delta_seconds = (double)(now_mono_ms - pss->prev_proc_sample_mono_ms) / 1000.0;

  /* Convert jiffy delta to CPU usage percentage over the sampling interval */
  if (delta_seconds > 0.0) {
    /* CPU usage normalized to system-wide percentage.
     *
     * Interpretation:
     * - 100% means all CPUs fully utilized
     * - Matches top(1) default behavior
     */
    *cpu_out = ((double)delta_jiffies / (double)clk_tck / delta_seconds * 100.0) / (double)cpu_core_count;
  }

  /* Return memory metrics to the caller:
   *
   * - rss_kb_out:
   *     Resident Set Size from /proc/<pid>/status (VmRSS).
   *     This is how large the process appears in RAM, counting all shared pages in full.
   *
   * - pss_kb_out:
   *     Proportional Set Size from /proc/<pid>/smaps_rollup.
   *     This is the kernel-accounted RAM cost of the process, with shared pages
   *     divided among their users. PSS is additive across processes.
   *
   * - uss_kb_out:
   *     Unique Set Size computed from the sum of Private_* fields in smaps_rollup.
   *     This estimates how much memory would be freed if the process exited.
   */
  *rss_kb_out = rss_kb;
  *pss_kb_out = pss_kb;
  *uss_kb_out = uss_kb;

  /* Update baselines */
  pss->prev_proc_utime = utime;
  pss->prev_proc_stime = stime;
  pss->prev_proc_sample_mono_ms = now_mono_ms;

  return true;
}

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
size_t
collect_process_list(char names[][MAX_PROC_NAME_LENGTH], size_t max_names)
{
  DIR *proc_dir = NULL;
  struct dirent *ent; /* Directory entry used when iterating over /proc */
  size_t count = 0;   /* Number of unique process names collected so far */
  char path[MAX_PROC_PATH_LENGTH];
  char buf[MAX_PROC_LINE_LENGTH];

  /* Open /proc to iterate over all running processes, return empty result on failure */
  proc_dir = opendir("/proc");
  if (!proc_dir) {
    return 0;
  }

  /* Iterate all /proc entries (numeric directories correspond to PIDs) */
  while ((ent = readdir(proc_dir)) != NULL) {
    /* /proc on some filesystems may not reliably report d_type, so accept DT_UNKNOWN too */
    if (ent->d_type != DT_DIR && ent->d_type != DT_UNKNOWN) {
      continue;
    }

    /* Only consider numeric /proc entries (PIDs)
     * skip non-numeric names and invalid or non-positive values
     */
    char *endptr = NULL;
    long pid = strtol(ent->d_name, &endptr, 10);
    if (*ent->d_name == '\0' || *endptr != '\0' || pid <= 0) {
      continue;
    }

    /* Read the process name from /proc/<pid>/comm
     * skip entries that disappear or cannot be opened
     */
    snprintf(path, sizeof(path), "/proc/%ld/comm", pid);
    FILE *f = fopen(path, "r");
    if (!f) {
      continue;
    }

    /* Read one line (process name) and ignore processes that exit mid-read */
    if (!fgets(buf, sizeof(buf), f)) {
      fclose(f);
      continue;
    }
    fclose(f);

    /* Strip trailing newline from /proc/<pid>/comm so buf is a clean NUL-terminated name */
    buf[strcspn(buf, "\n")] = '\0';

    /* Skip kernel threads: in /proc/<pid>/comm they typically appear as "[kthread-name]" */
    if (buf[0] == '[') {
      continue;
    }

    /* Deduplicate: /proc may contain multiple PIDs with the same comm name, but we only want unique names */
    bool exists = false;
    for (size_t i = 0; i < count; i++) {
      if (strcmp(names[i], buf) == 0) {
        exists = true;
        break;
      }
    }
    if (exists) {
      continue;
    }
    /* Copy the process name into the output list (always NUL-terminate) and consume one slot */
    strncpy(names[count], buf, MAX_PROC_NAME_LENGTH - 1);
    names[count][MAX_PROC_NAME_LENGTH - 1] = '\0';
    count++;

    /* Stop scanning once the caller-provided output buffer is full */
    if (count >= max_names) {
      break;
    }
  }
  /* Release the /proc directory handle before returning to avoid leaking an fd */
  closedir(proc_dir);

  return count;
}
