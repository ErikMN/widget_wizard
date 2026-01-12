/* WebSocket server for streaming system statistics
 *
 * Test with chrome-plugin "WebSocket Test Client"
 * https://chromewebstore.google.com/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn
 *
 * ws://192.168.0.90:9000
 *
 * App overview:
 * - The application runs entirely in a single GLib main loop thread.
 * - System statistics are periodically sampled from /proc and stored in latest_stats.
 * - libwebsockets is serviced from the same GLib main loop via a timer.
 * - Each WebSocket client has its own send timer, but all clients share the same sampled statistics.
 * - Each WebSocket client can optionally request per-process monitoring by process name.
 * - Each WebSocket client can request a one-shot list of running process names.
 * - Each WebSocket client can request one-shot filesystem storage information.
 *
 * Data flow:
 *   /proc -> stats_timer_cb() -> latest_stats
 *   latest_stats -> ws_callback() -> WebSocket clients
 *
 * Per-process monitoring:
 * - The client can send a JSON command to enable monitoring of a single process:
 *     { "monitor": "process_name" }
 * - process_name is matched against the first /proc/<pid>/comm that equals the given string.
 * - Per-process monitoring state is per WebSocket connection (per-session), not global.
 * - The server responds by adding a "proc" object to the periodic JSON snapshots:
 *     "proc": {
 *       "name": "<process_name>",
 *       "cpu": <percent>,
 *       "rss_kb": <kB>,
 *       "pss_kb": <kB>,
 *       "uss_kb": <kB>
 *     }
 * - Process CPU% is computed from (utime + stime) deltas over monotonic time.
 *   Interpretation: 100% = all CPUs fully utilized (system-wide percentage, matches top(1) default).
 * - Process RSS is reported from VmRSS in /proc/<pid>/status (kB).
 * - Process PSS and USS are reported from /proc/<pid>/smaps_rollup:
 *     - PSS (Proportional Set Size) is the kernel-accounted RAM cost of the process.
 *     - USS (Unique Set Size) is the amount of private memory that would be freed if the process exited.
 * - To stop per-process monitoring, the client sends:
 *     { "monitor": "" }
 * - If the process cannot be found, the server includes an "error" object:
 *     "error": { "type": "process_not_found", "message": "Process '<name>' not found" }
 *
 * One-shot process list:
 * - The client can request a list of running process names:
 *     { "list_processes": true }
 * - The server scans /proc/<pid>/comm, skips kernel threads ([...]),
 *   deduplicates names, and returns a bounded list:
 *     { "processes": ["name1", "name2", ...] }
 * - The list is intended for UI discovery and filtering, not as a full
 *   system process inventory.
 * - The response is size-bounded and may be truncated if limits are reached.
 *
 * One-shot storage information:
 * - The client can request filesystem usage statistics:
 *     { "storage": true }
 * - The server probes a fixed allowlist of paths using statvfs().
 * - Reported values include total, used, and available space in kilobytes.
 * - Filesystem type is resolved from /proc/self/mounts and reflects the
 *   mounted filesystem visible at that path (df-style view, e.g. "overlay",
 *   "tmpfs", "ext4"), not necessarily the underlying backing store.
 * - Storage information is returned only on explicit request and is not streamed.
 *
 * Returned JSON message format example:
 * {
 *   "ts": 1766089635269,
 *   "mono_ms": 4689109526,
 *   "delta_ms": 500,
 *   "cpu": 5.42,
 *   "cpu_cores": 4,
 *   "mem_total_kb": 981716,
 *   "mem_available_kb": 531704,
 *   "uptime_s": 4689109,
 *   "load1": 0.28,
 *   "load5": 0.34,
 *   "load15": 0.26,
 *   "clients": { "connected": 3, "max": 10 },
 *   "proc": {
 *     "name": "my_process",
 *     "cpu": 12.34,
 *     "rss_kb": 11052,
 *     "pss_kb": 7421,
 *     "uss_kb": 5310
 *   }
 * }
 *
 * Scope and limitations:
 * - Intended for local or trusted networks (no TLS or authentication).
 * - Designed for a small number of concurrent clients.
 * - Not thread-safe by design: All logic runs in the GLib main loop thread.
 * - Not intended as a general-purpose metrics system.
 * - Processes with spaces or parentheses in comm may not be parsed correctly.
 */
#include <dirent.h>
#include <getopt.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/statvfs.h>
#include <syslog.h>
#include <time.h>
#include <unistd.h>

#include <jansson.h>
#include <libwebsockets.h>
#include <glib/gstdio.h>
#include <glib-unix.h>
#include <axsdk/axparameter.h>

/* Axparameters used by this app */
#define PARAM_NAME_APPLICATION_RUNNING_PARAM "ApplicationRunning"

/* Maximum size of a single JSON WebSocket message.
 *
 * Current worst-case payload is around 320 bytes (including per-process stats),
 * leaving ample headroom for numeric growth and minor field additions.
 * Messages are constructed using snprintf() and dropped on truncation.
 */
#define MAX_WS_MESSAGE_LENGTH 1024

/* Maximum length of a single line read from /proc text files.
 *
 * Used for fgets() buffers when parsing files like /proc/stat, /proc/meminfo,
 * /proc/uptime, /proc/loadavg, and /proc/<pid>/status.
 *
 * This value is independent of MAX_WS_MESSAGE_LENGTH.
 * Lines in these files are typically much shorter, but 512 provides safe headroom.
 * On successful fgets(), the buffer is always NUL-terminated.
 */
#define MAX_PROC_LINE_LENGTH 512

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

/* Maximum size (bytes) of the one-shot JSON response for the process list.
 *
 * The list response is formatted as:
 *   { "processes": ["name1","name2", ...] }
 *
 * This buffer is intentionally larger than MAX_WS_MESSAGE_LENGTH because it
 * can contain hundreds of short strings. If the buffer fills up while appending
 * entries, the response is truncated (partial list is sent) rather than
 * allocating dynamically.
 *
 * NOTE:
 * This constant must be kept in sync with the per-session output buffer used
 * for list responses (pss->list_buf).
 */
#define MAX_LIST_JSON_LENGTH 8192

/* Maximum number of storage mount points reported in a single one-shot response.
 *
 * This bounds:
 * - The number of paths probed with statvfs()
 * - JSON construction time
 * - Worst-case response size
 *
 * The value is intentionally small and fixed because storage reporting
 * is intended for UI inspection, not exhaustive filesystem enumeration.
 */
#define MAX_STORAGE_MOUNTS 8

/* Default TCP port the WebSocket server listens on.
 *
 * Chosen as a fixed, non-privileged port for local / embedded use.
 * Must match the client connection URL (ws://<ip>:9000).
 */
#define WS_PORT_DEFAULT 9000

/* Maximum number of concurrent WebSocket clients.
 *
 * Includes both fully established connections and handshakes in progress.
 * This limit bounds resource usage and prevents unbounded /proc polling
 * and per-session state allocation.
 */
#define MAX_WS_CONNECTED_CLIENTS 10

/* scanf() field widths must be compile-time decimal literals in the format string.
 *
 * The C preprocessor cannot stringify an expression like (MAX_PROC_NAME_LENGTH - 1)
 * into a valid scanf width, so the value is defined explicitly and verified below.
 *
 * This width ensures space for the terminating NUL when scanning into
 * char proc_name[MAX_PROC_NAME_LENGTH].
 */
#define MAX_PROC_NAME_SCAN_WIDTH 63
_Static_assert(MAX_PROC_NAME_SCAN_WIDTH == MAX_PROC_NAME_LENGTH - 1,
               "MAX_PROC_NAME_SCAN_WIDTH must be MAX_PROC_NAME_LENGTH - 1");

/* Macro helpers for turning macro *values* into string literals.
 *
 * Two-step expansion is required so STR(MAX_PROC_NAME_SCAN_WIDTH)
 * expands the macro first (e.g. 5) and then stringifies it ("5").
 *
 * Used to build scanf format strings with compile-time widths.
 */
#define STR_HELPER(x) #x
#define STR(x) STR_HELPER(x)

/******************************************************************************/

/* Global variables */
static GMainLoop *main_loop = NULL;
static struct lws_context *lws_ctx = NULL;
static guint stats_timer_id = 0;
static guint lws_service_timer_id = 0;
static long cpu_core_count = 1;

/* Connection accounting:
 *
 * - ws_pending_client_count is incremented in LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION.
 * - It is decremented either when the handshake completes
 *   (LWS_CALLBACK_ESTABLISHED) or when the connection is destroyed
 *   before establishment (LWS_CALLBACK_WSI_DESTROY).
 *
 * - ws_connected_client_count tracks fully established WebSocket
 *   connections only and is decremented in LWS_CALLBACK_CLOSED.
 *
 * This accounting is required because libwebsockets does not guarantee
 * that FILTER_PROTOCOL_CONNECTION is paired with ESTABLISHED or CLOSED
 * on all handshake failure paths.
 */
static unsigned int ws_pending_client_count = 0;
static unsigned int ws_connected_client_count = 0;

/* Function declarations */
static gboolean stats_timer_cb(gpointer user_data);

/******************************************************************************/

/* Per-connected WebSocket client (per-session) storage.
 * libwebsockets gives us one instance of this struct for each connection and
 * passes it back as the "user" pointer in ws_callback().
 *
 * Buffer layout:
 * - First LWS_PRE bytes: reserved for libwebsockets (must not be written)
 * - Remaining bytes: outgoing message payload (JSON)
 */
struct per_session_data {
  /* NOTE: Buffers must be large enough for the biggest JSON payload */
  unsigned char stream_buf[LWS_PRE + MAX_WS_MESSAGE_LENGTH];
  unsigned char list_buf[LWS_PRE + MAX_LIST_JSON_LENGTH];

  /* True if this connection was counted toward ws_connected_client_count */
  bool counted;

  /* Process monitoring */
  char proc_name[MAX_PROC_NAME_LENGTH];
  bool proc_enabled;

  /* Per-process CPU baseline */
  unsigned long long prev_proc_utime;
  unsigned long long prev_proc_stime;
  uint64_t prev_proc_sample_mono_ms;
};

/* Struct for collecting system stats */
struct sys_stats {
  /* CPU usage */
  double cpu_usage;
  /* Memory usage */
  long mem_total_kb;
  long mem_available_kb;
  /* Uptime and load */
  double uptime_s;
  double load1;
  double load5;
  double load15;
  /* Timestamp */
  uint64_t timestamp_ms;
  /* Monotonic timestamp and delta */
  uint64_t monotonic_ms;
  uint64_t delta_ms;
};

/* latest_stats is accessed only from the GLib main loop thread.
 * No locking is required as long as libwebsockets is serviced
 * exclusively via lws_service() in this loop.
 */
static struct sys_stats latest_stats;
struct storage_info {
  char path[MAX_PROC_PATH_LENGTH];
  char fs_type[32]; /* Filesystem type (e.g. ext4, tmpfs) */
  unsigned long long total_kb;
  unsigned long long used_kb;
  unsigned long long available_kb;
};

/******************************************************************************/

// clang-format off
/* List of filesystem mount points for one-shot storage reporting */
static const char *storage_paths[] = {
  "/",
  "/mnt/flash",
  "/usr/lib/persistent",
  "/var/lib",
  "/var/cache"
};
// clang-format on

/* Resolve filesystem type for a given path using /proc/self/mounts.
 *
 * - Finds the mounted filesystem visible at this path (df-style view).
 * - Chooses the longest matching mount point prefix.
 * - For overlay/union filesystems, this returns the mount type
 *   (e.g. "overlay"), not the backing filesystem.
 *
 * Returns true on success, false if no matching mount is found.
 */
static bool
get_fs_type_for_path(const char *path, char *fs_type, size_t fs_type_len)
{
  /* Open the current process mount table, fail gracefully if unavailable */
  FILE *f = fopen("/proc/self/mounts", "r");
  if (!f) {
    return false;
  }
  char mount_dev[128];
  char mount_point[MAX_PROC_PATH_LENGTH];
  char type[32];
  size_t best_len = 0;
  bool found = false;

  /* Parse one /proc/self/mounts entry: device, mount point, filesystem type */
  while (fscanf(f, "%127s %255s %31s %*s %*d %*d\n", mount_dev, mount_point, type) == 3) {
    size_t len = strlen(mount_point);
    /* Select the longest mount point that is a proper prefix of the path */
    if (len > best_len && strncmp(path, mount_point, len) == 0 && (path[len] == '/' || path[len] == '\0')) {
      /* Record the best (longest) matching filesystem type */
      strncpy(fs_type, type, fs_type_len - 1);
      fs_type[fs_type_len - 1] = '\0';
      best_len = len;
      found = true;
    }
  }
  fclose(f);

  return found;
}

/* Read filesystem storage usage for a single path using statvfs().
 *
 * - The path should point to a mount point (or any directory within it).
 * - Values are reported from the perspective of an unprivileged user:
 *     available_kb uses f_bavail (excludes root-reserved blocks).
 * - used_kb is computed from total - free (free uses f_bfree, includes reserved blocks),
 *   matching df(1) "Used" semantics.
 *
 * Returns true on success, false on statvfs() failure or invalid arguments.
 */
static bool
read_storage_for_path(const char *path, struct storage_info *out)
{
  struct statvfs vfs;

  if (!path || !out) {
    return false;
  }

  if (statvfs(path, &vfs) != 0) {
    return false;
  }

  /* f_frsize is the fragment size (preferred over f_bsize) */
  unsigned long long block_size = vfs.f_frsize;

  unsigned long long total = vfs.f_blocks * block_size;
  unsigned long long free = vfs.f_bfree * block_size;
  unsigned long long avail = vfs.f_bavail * block_size;

  out->total_kb = total / 1024ULL;
  out->available_kb = avail / 1024ULL;
  out->used_kb = (total - free) / 1024ULL;

  strncpy(out->path, path, sizeof(out->path) - 1);
  out->path[sizeof(out->path) - 1] = '\0';

  /* Resolve filesystem type (best-effort) */
  if (!get_fs_type_for_path(path, out->fs_type, sizeof(out->fs_type))) {
    strncpy(out->fs_type, "unknown", sizeof(out->fs_type) - 1);
    out->fs_type[sizeof(out->fs_type) - 1] = '\0';
  }

  return true;
}

/* Collect one-shot storage information for a bounded set of mount points.
 *
 * - Iterates the static storage_paths allowlist and probes each path with statvfs().
 * - Paths that do not exist or cannot be queried are skipped.
 * - Collection stops when max_entries have been written to the output array.
 *
 * Returns:
 * - Number of storage_info entries written to out.
 */
static size_t
collect_storage_info(struct storage_info *out, size_t max_entries)
{
  size_t count = 0;

  for (size_t i = 0; i < G_N_ELEMENTS(storage_paths); i++) {
    if (count >= max_entries) {
      break;
    }
    struct storage_info info;
    if (!read_storage_for_path(storage_paths[i], &info)) {
      continue;
    }
    out[count++] = info;
  }

  return count;
}

/******************************************************************************/

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
static size_t
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

/******************************************************************************/

/* Read CPU and memory usage for a named process.
 *
 * - Matches the first /proc/<pid>/comm equal to proc_name.
 * - CPU usage is computed from utime + stime deltas over monotonic time.
 * - Memory usage is reported as VmRSS in kB.
 *
 * NOTE: Limitations:
 * - Processes with spaces or parentheses in comm may not be parsed correctly
 *
 * Returns true on success, false if the process was not found or data
 * could not be read. On failure, outputs are set to 0.
 */
static bool
read_process_stats(const char *proc_name,
                   struct per_session_data *pss,
                   uint64_t now_mono_ms,
                   double *cpu_out,
                   long *rss_kb_out,
                   long *pss_kb_out,
                   long *uss_kb_out)
{
  DIR *proc_dir;
  struct dirent *ent;
  pid_t pid = -1;
  char path[MAX_PROC_PATH_LENGTH];
  char buf[MAX_PROC_LINE_LENGTH];

  unsigned long long utime = 0;
  unsigned long long stime = 0;
  long rss_kb = 0;

  const long clk_tck = sysconf(_SC_CLK_TCK);

  if (!proc_name || !pss || !cpu_out || !rss_kb_out || clk_tck <= 0) {
    return false;
  }

  *cpu_out = 0.0;
  *rss_kb_out = 0;
  *pss_kb_out = 0;
  *uss_kb_out = 0;

  /* Find PID by scanning /proc */
  proc_dir = opendir("/proc");
  if (!proc_dir) {
    return false;
  }

  while ((ent = readdir(proc_dir)) != NULL) {
    /* /proc entries for processes are numeric */
    if (ent->d_type != DT_DIR && ent->d_type != DT_UNKNOWN) {
      continue;
    }

    char *endptr = NULL;
    long val = strtol(ent->d_name, &endptr, 10);
    if (*ent->d_name == '\0' || *endptr != '\0' || val <= 0) {
      continue;
    }

    snprintf(path, sizeof(path), "/proc/%ld/comm", val);
    FILE *f = fopen(path, "r");
    if (!f) {
      continue;
    }

    if (fgets(buf, sizeof(buf), f)) {
      /* Strip trailing newline */
      buf[strcspn(buf, "\n")] = '\0';
      if (strcmp(buf, proc_name) == 0) {
        pid = (pid_t)val;
        fclose(f);
        break;
      }
    }
    fclose(f);
  }
  closedir(proc_dir);

  if (pid <= 0) {
    /* Process not found */
    pss->prev_proc_utime = 0;
    pss->prev_proc_stime = 0;
    pss->prev_proc_sample_mono_ms = 0;
    return false;
  }
  /* Read /proc/<pid>/stat */
  snprintf(path, sizeof(path), "/proc/%d/stat", pid);
  FILE *statf = fopen(path, "r");
  if (!statf) {
    return false;
  }

  /*
   * Field layout:
   *  1 pid
   *  2 comm
   *  3 state
   *  ...
   * 14 utime
   * 15 stime
   *
   * Skip everything except utime and stime.
   */
  unsigned long long dummy;
  char comm[128];
  char state;

  int scanned = fscanf(statf,
                       "%llu %127s %c "
                       "%llu %llu %llu %llu %llu "
                       "%llu %llu %llu %llu %llu "
                       "%llu %llu",
                       &dummy,
                       comm,
                       &state,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &dummy,
                       &utime,
                       &stime);
  fclose(statf);

  if (scanned < 15) {
    /* Malformed /proc/<pid>/stat (comm contains spaces)
     * Reset baseline to avoid bogus deltas on next sample
     */
    pss->prev_proc_utime = 0;
    pss->prev_proc_stime = 0;
    pss->prev_proc_sample_mono_ms = 0;
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

/******************************************************************************/

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
static uint64_t
get_time_ms(clockid_t clk_id)
{
  struct timespec ts;

  if (clock_gettime(clk_id, &ts) != 0) {
    return 0;
  }

  /* Convert seconds + nanoseconds to milliseconds */
  return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;
}

/******************************************************************************/

/* Read MemTotal and MemAvailable from /proc/meminfo
 * and return them in stats structure.
 */
static void
read_mem_stats(struct sys_stats *stats)
{
  char line[MAX_PROC_LINE_LENGTH];
  long value = 0;
  int got_total = 0;
  int got_avail = 0;
  FILE *f;

  if (!stats) {
    return;
  }

  /* Clear old values */
  stats->mem_total_kb = 0;
  stats->mem_available_kb = 0;

  f = fopen("/proc/meminfo", "r");
  if (!f) {
    return;
  }

  while (fgets(line, sizeof(line), f)) {
    if (!got_total) {
      if (sscanf(line, "MemTotal: %ld kB", &value) == 1) {
        stats->mem_total_kb = value;
        got_total = 1;
        continue;
      }
    }

    if (!got_avail) {
      if (sscanf(line, "MemAvailable: %ld kB", &value) == 1) {
        stats->mem_available_kb = value;
        got_avail = 1;
        continue;
      }
    }

    if (got_total && got_avail) {
      break;
    }
  }

  fclose(f);
}

/******************************************************************************/

/* Read aggregate CPU time counters from /proc/stat and compute CPU usage.
 *
 * The "cpu" line in /proc/stat exposes cumulative time counters (in jiffies)
 * since boot, split into states (user, system, idle, iowait, irq, softirq, steal).
 *
 * CPU usage is calculated as the fraction of non-idle time over the interval
 * between this call and the previous call:
 *
 *   idle_delta  = (idle + iowait) - prev_idle
 *   total_delta = total_time - prev_total
 *   usage%      = 100 * (1 - idle_delta / total_delta)
 *
 * The first call only initializes the previous counters and returns 0.0.
 * On read or parse failure, cpu_usage is set to 0.0.
 */
static void
read_cpu_stats(struct sys_stats *stats)
{
  /* Buffer for reading a single line from /proc/stat */
  char line[MAX_PROC_LINE_LENGTH];
  /* Previous cumulative CPU idle time (idle + iowait), used to compute deltas */
  static unsigned long long prev_idle = 0;
  /* Previous cumulative total CPU time, used to compute deltas */
  static unsigned long long prev_total = 0;
  /* Indicates whether a baseline CPU sample has been recorded */
  static bool initialized = false;

  /* CPU time counters read from /proc/stat aggregate "cpu" line
   *  user      - Time spent executing user-space processes
   *  nice      - Time spent executing user-space processes with a non-zero nice value
   *  system    - Time spent executing kernel-space processes
   *  idle      - Time spent idle
   *  iowait    - Time spent idle while waiting for I/O
   *  irq       - Time spent servicing hardware interrupts
   *  softirq   - Time spent servicing software interrupts
   *  steal     - Time stolen by the hypervisor (virtualized systems)
   *
   * Derived values:
   *  idle_time   = idle + iowait
   *  total_time  = Sum of all CPU time counters
   *  delta_idle  = idle_time  - previous idle_time
   *  delta_total = total_time - previous total_time
   */
  unsigned long long user, nice, system, idle, iowait;
  unsigned long long irq, softirq, steal;
  unsigned long long idle_time, total_time;
  unsigned long long delta_idle, delta_total;
  FILE *f = NULL;

  if (!stats) {
    return;
  }

  /* Default to a known value on all failure paths */
  stats->cpu_usage = 0.0;

  f = fopen("/proc/stat", "r");
  if (!f) {
    return;
  }

  if (!fgets(line, sizeof(line), f)) {
    fclose(f);
    return;
  }
  fclose(f);

  /* Read aggregate CPU line */
  if (sscanf(line,
             "cpu %llu %llu %llu %llu %llu %llu %llu %llu",
             &user,
             &nice,
             &system,
             &idle,
             &iowait,
             &irq,
             &softirq,
             &steal) != 8) {
    return;
  }

  idle_time = idle + iowait;
  total_time = user + nice + system + idle + iowait + irq + softirq + steal;

  if (!initialized) {
    prev_idle = idle_time;
    prev_total = total_time;
    initialized = true;
    return;
  }

  /* Detect counter reset or overflow */
  if (idle_time < prev_idle || total_time < prev_total) {
    prev_idle = idle_time;
    prev_total = total_time;
    return;
  }

  delta_idle = idle_time - prev_idle;
  delta_total = total_time - prev_total;

  if (delta_total > 0) {
    stats->cpu_usage = 100.0 * (1.0 - (double)delta_idle / (double)delta_total);
  }

  prev_idle = idle_time;
  prev_total = total_time;
}

/******************************************************************************/

/* Read system uptime and load averages.
 *
 * Data sources:
 * - /proc/uptime:
 *     First value  -> system uptime in seconds since boot
 *     Second value -> cumulative idle time across all CPUs (ignored)
 *
 * - /proc/loadavg:
 *     load1  -> 1-minute load average
 *     load5  -> 5-minute load average
 *     load15 -> 15-minute load average
 *
 * On any read or parse failure, the corresponding values remain zero.
 * This function performs no caching and always reads directly from /proc.
 */
static void
read_uptime_load(struct sys_stats *stats)
{
  char line[MAX_PROC_LINE_LENGTH];
  FILE *f = NULL;

  if (!stats) {
    return;
  }

  stats->uptime_s = 0.0;
  stats->load1 = 0.0;
  stats->load5 = 0.0;
  stats->load15 = 0.0;

  f = fopen("/proc/uptime", "r");
  if (f) {
    double up = 0.0;
    double idle = 0.0;
    if (fgets(line, sizeof(line), f)) {
      if (sscanf(line, "%lf %lf", &up, &idle) == 2) {
        stats->uptime_s = up;
      }
    }
    fclose(f);
  }

  f = fopen("/proc/loadavg", "r");
  if (f) {
    double a = 0.0, b = 0.0, c = 0.0;
    if (fgets(line, sizeof(line), f)) {
      if (sscanf(line, "%lf %lf %lf", &a, &b, &c) == 3) {
        stats->load1 = a;
        stats->load5 = b;
        stats->load15 = c;
      }
    }
    fclose(f);
  }
}

/******************************************************************************/

/*
 * Statistics sampling timer:
 *
 * - The stats timer is started when the first WebSocket client connects.
 * - The stats timer is stopped when the last client disconnects.
 *
 * Rationale:
 * - Avoid unnecessary /proc polling when no clients are connected.
 * - Sampling frequency is independent of WebSocket send frequency.
 */
static void
start_stats_timer(void)
{
  if (stats_timer_id == 0) {
    stats_timer_id = g_timeout_add(500, stats_timer_cb, NULL);
  }
}

/* Stop the stats timer */
static void
stop_stats_timer(void)
{
  if (stats_timer_id != 0) {
    g_source_remove(stats_timer_id);
    stats_timer_id = 0;
  }
}

/******************************************************************************/

/* WebSocket protocol callback
 *
 * - Server sends periodic JSON snapshots.
 * - NOTE: Messages are write-only: incoming messages are ignored.
 * - Update rate is approximately 500 ms per client.
 * - CPU usage is reported as a percentage [0.0 - 100.0].
 * - Memory values are reported in kilobytes.
 * - The first CPU value after connect may be 0.0 due to baseline initialization.
 * - Only allow MAX_WS_CONNECTED_CLIENTS concurrent connections.
 */
static int
ws_callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len)
{
  (void)in;

  switch (reason) {

  case LWS_CALLBACK_ESTABLISHED: {
    struct per_session_data *pss = user;

    /* Convert one pending slot to active */
    if (ws_pending_client_count > 0) {
      ws_pending_client_count--;
    }

    ws_connected_client_count++;
    pss->counted = true;

    /* If at least one connection: start the timer */
    if (ws_connected_client_count == 1) {
      start_stats_timer();
    }
    syslog(LOG_INFO, "WebSocket client connected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    /* Send immediately */
    lws_callback_on_writable(wsi);
    /* Then every 500ms */
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
    break;
  }

  /*
   * Per-client send timer:
   *
   * Each WebSocket connection has its own libwebsockets timer that
   * controls how often data is sent to that client.
   *
   * This timer:
   * - Does NOT sample system statistics.
   * - Only schedules LWS_CALLBACK_SERVER_WRITEABLE.
   *
   * All clients observe the same latest_stats snapshot.
   */
  case LWS_CALLBACK_TIMER: {
    /* Ask lws for a writeable callback */
    lws_callback_on_writable(wsi);
    /* Rearm timer for next tick */
    lws_set_timer_usecs(wsi, LWS_USEC_PER_SEC / 2);
    break;
  }

  case LWS_CALLBACK_RECEIVE: {
    /* Log received data */
    syslog(LOG_INFO, "WebSocket received %zu bytes", len);
    struct per_session_data *pss = user;

    if (!pss || len == 0 || len >= 128) {
      break;
    }

    char msg[128 + 1];
    memcpy(msg, in, len);
    msg[len] = '\0';

    /* Parse JSON using libjansson */
    json_error_t json_error;
    json_t *root = json_loads(msg, 0, &json_error);
    if (!root || !json_is_object(root)) {
      syslog(LOG_WARNING,
             "Invalid JSON received: %s (line %d, column %d)",
             json_error.text,
             json_error.line,
             json_error.column);
      if (root) {
        json_decref(root);
      }
      break;
    }

    /* One-shot process list request: { "list_processes": true }
     *
     * NOTE:
     * This triggers a full /proc scan to build a unique process list.
     * The operation may cause brief CPU spikes when repeatedly invoked,
     * which is acceptable as it is user-initiated and not performed
     * automatically or in the background.
     */
    json_t *list_processes = json_object_get(root, "list_processes");
    if (json_is_true(list_processes)) {
      /* Buffer for a deduplicated snapshot of process names read from /proc/<pid>/comm */
      char proc_names[MAX_PROCESS_COUNT][MAX_PROC_NAME_LENGTH];
      size_t proc_count = collect_process_list(proc_names, MAX_PROCESS_COUNT);

      json_t *resp = json_object();
      json_t *arr = json_array();
      bool truncated = false;

      if (!resp || !arr) {
        if (arr) {
          json_decref(arr);
        }
        if (resp) {
          json_decref(resp);
        }
        json_decref(root);
        break;
      }
      /* Populate process array */
      for (size_t i = 0; i < proc_count; i++) {
        if (json_array_append_new(arr, json_string(proc_names[i])) != 0) {
          syslog(LOG_WARNING, "Failed to append process name to JSON array");
          truncated = true;
          break;
        }
      }
      json_object_set_new(resp, "processes", arr);

      /* Serialize into fixed buffer, truncate by dropping tail entries */
      for (;;) {
        /* Serialize JSON into the fixed per-session buffer (fails if it does not fit) */
        int out_len = json_dumpb(resp, (char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, JSON_COMPACT);
        /* Write the output */
        if (out_len >= 0) {
          int written = lws_write(wsi, &pss->list_buf[LWS_PRE], (size_t)out_len, LWS_WRITE_TEXT);
          if (written < 0) {
            syslog(LOG_WARNING, "lws_write failed");
          }
          break;
        }
        /* Too big (or other failure): try truncating the array */
        size_t n = json_array_size(arr);
        if (n == 0) {
          syslog(LOG_WARNING, "Failed to serialize process list JSON (buffer %u bytes)", MAX_LIST_JSON_LENGTH);
          break;
        }
        json_array_remove(arr, n - 1);
        truncated = true;
      }
      if (truncated) {
        syslog(LOG_INFO, "Process list response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
      }
      json_decref(resp);
      json_decref(root);
      break;
    }

    /* One-shot storage info request: { "storage": true } */
    json_t *storage_req = json_object_get(root, "storage");
    if (json_is_true(storage_req)) {
      struct storage_info storage[MAX_STORAGE_MOUNTS];
      size_t storage_count = collect_storage_info(storage, MAX_STORAGE_MOUNTS);

      json_t *resp = json_object();
      json_t *arr = json_array();
      bool truncated = false;

      if (!resp || !arr) {
        if (arr) {
          json_decref(arr);
        }
        if (resp) {
          json_decref(resp);
        }
        json_decref(root);
        break;
      }
      /* Populate storage array */
      for (size_t i = 0; i < storage_count; i++) {
        json_t *obj = json_object();
        if (!obj) {
          truncated = true;
          break;
        }
        /* Populate JSON object with storage statistics */
        json_object_set_new(obj, "path", json_string(storage[i].path));
        json_object_set_new(obj, "fs", json_string(storage[i].fs_type));
        json_object_set_new(obj, "total_kb", json_integer(storage[i].total_kb));
        json_object_set_new(obj, "used_kb", json_integer(storage[i].used_kb));
        json_object_set_new(obj, "available_kb", json_integer(storage[i].available_kb));

        /* Append one storage object to the JSON array */
        if (json_array_append_new(arr, obj) != 0) {
          json_decref(obj);
          truncated = true;
          break;
        }
      }
      json_object_set_new(resp, "storage", arr);

      /* Serialize into fixed buffer, truncate by dropping tail entries */
      for (;;) {
        /* Serialize JSON into the fixed per-session buffer (fails if it does not fit) */
        int out_len = json_dumpb(resp, (char *)&pss->list_buf[LWS_PRE], MAX_LIST_JSON_LENGTH, JSON_COMPACT);
        /* Write the output */
        if (out_len >= 0) {
          int written = lws_write(wsi, &pss->list_buf[LWS_PRE], (size_t)out_len, LWS_WRITE_TEXT);
          if (written < 0) {
            syslog(LOG_WARNING, "lws_write failed");
          }
          break;
        }
        /* Too big (or other failure): try truncating the array */
        size_t n = json_array_size(arr);
        if (n == 0) {
          syslog(LOG_WARNING, "Failed to serialize storage JSON (buffer %u bytes)", MAX_LIST_JSON_LENGTH);
          break;
        }
        json_array_remove(arr, n - 1);
        truncated = true;
      }
      if (truncated) {
        syslog(LOG_INFO, "Storage response truncated to fit %u bytes", MAX_LIST_JSON_LENGTH);
      }
      json_decref(resp);
      json_decref(root);
      break;
    }

    /* Expect JSON: { "monitor": "process_name" } */
    json_t *monitor = json_object_get(root, "monitor");
    if (!monitor) {
      json_decref(root);
      break;
    }

    /* Explicit stop-monitoring command: { "monitor": "" } */
    if (json_is_string(monitor) && json_string_value(monitor)[0] == '\0') {
      pss->proc_enabled = false;
      pss->proc_name[0] = '\0';
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      syslog(LOG_INFO, "Client stopped process monitoring");
      json_decref(root);
      break;
    }

    /* Normal start-monitoring command */
    if (json_is_string(monitor)) {
      strncpy(pss->proc_name, json_string_value(monitor), sizeof(pss->proc_name) - 1);
      pss->proc_name[sizeof(pss->proc_name) - 1] = '\0';
      pss->proc_enabled = true;
      pss->prev_proc_utime = 0;
      pss->prev_proc_stime = 0;
      pss->prev_proc_sample_mono_ms = 0;
      syslog(LOG_INFO, "Client monitoring process: %s", pss->proc_name);
    }
    json_decref(root);
    break;
  }

  case LWS_CALLBACK_CLOSED: {
    struct per_session_data *pss = user;

    if (pss && pss->counted) {
      if (ws_connected_client_count > 0) {
        ws_connected_client_count--;
      }
      /* If no connections: Stop the timer */
      if (ws_connected_client_count == 0) {
        stop_stats_timer();
      }
    }
    syslog(LOG_INFO, "WebSocket client disconnected (%u/%u)", ws_connected_client_count, MAX_WS_CONNECTED_CLIENTS);
    break;
  }

  case LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION: {
    /* Enforce connection limit across both established and in-progress WebSocket handshakes */
    if (ws_connected_client_count + ws_pending_client_count >= MAX_WS_CONNECTED_CLIENTS) {
      syslog(LOG_WARNING, "Rejecting WebSocket connection: client limit (%u) reached", MAX_WS_CONNECTED_CLIENTS);
      return -1;
    }

    /* Reserve a slot for this connection attempt */
    ws_pending_client_count++;

    break;
  }

  case LWS_CALLBACK_SERVER_WRITEABLE: {
    struct per_session_data *pss = user;
    char json[MAX_WS_MESSAGE_LENGTH];
    int json_len;

    if (!pss) {
      break;
    }
    /* Construct the JSON response */
    json_len = snprintf(json,
                        sizeof(json),
                        "{ \"ts\": %" PRIu64 ", \"mono_ms\": %" PRIu64 ", \"delta_ms\": %" PRIu64 ", \"cpu\": %.2f"
                        ", \"cpu_cores\": %ld"
                        ", \"mem_total_kb\": %ld"
                        ", \"mem_available_kb\": %ld"
                        ", \"uptime_s\": %.0f"
                        ", \"load1\": %.2f"
                        ", \"load5\": %.2f"
                        ", \"load15\": %.2f"
                        ", \"clients\": { \"connected\": %u, \"max\": %u }",
                        latest_stats.timestamp_ms,
                        latest_stats.monotonic_ms,
                        latest_stats.delta_ms,
                        latest_stats.cpu_usage,
                        cpu_core_count,
                        latest_stats.mem_total_kb,
                        latest_stats.mem_available_kb,
                        latest_stats.uptime_s,
                        latest_stats.load1,
                        latest_stats.load5,
                        latest_stats.load15,
                        ws_connected_client_count,
                        MAX_WS_CONNECTED_CLIENTS);
    if (json_len < 0 || (size_t)json_len >= sizeof(json)) {
      syslog(LOG_ERR, "JSON message truncated, dropping the frame");
      break;
    }
    /* Monitor a process */
    if (pss->proc_enabled) {
      double proc_cpu = 0.0;
      long proc_rss_kb = 0;
      long proc_pss_kb = 0;
      long proc_uss_kb = 0;

      /* Read the process stats */
      if (read_process_stats(
              pss->proc_name, pss, latest_stats.monotonic_ms, &proc_cpu, &proc_rss_kb, &proc_pss_kb, &proc_uss_kb)) {
        json_t *proc = json_object();
        if (!proc) {
          break;
        }
        /* Populate process statistics */
        json_object_set_new(proc, "name", json_string(pss->proc_name));
        json_object_set_new(proc, "cpu", json_real(proc_cpu));
        json_object_set_new(proc, "rss_kb", json_integer(proc_rss_kb));
        json_object_set_new(proc, "pss_kb", json_integer(proc_pss_kb));
        json_object_set_new(proc, "uss_kb", json_integer(proc_uss_kb));

        /* Serialize process object to a temporary JSON buffer */
        char proc_buf[256];
        int proc_len = json_dumpb(proc, proc_buf, sizeof(proc_buf), JSON_COMPACT);
        json_decref(proc);

        if (proc_len < 0 || (size_t)proc_len > sizeof(proc_buf)) {
          break;
        }
        /* Append serialized process JSON fragment to the response buffer */
        int ret = snprintf(json + json_len, sizeof(json) - json_len, ", \"proc\": %.*s", proc_len, proc_buf);
        if (ret < 0 || (size_t)ret >= sizeof(json) - json_len) {
          syslog(LOG_ERR, "JSON message truncated, dropping the frame");
          break;
        }
        json_len += ret;
      } else {
        /* Process not found */
        json_t *err = json_object();
        if (!err) {
          break;
        }
        /* Set error type */
        json_object_set_new(err, "type", json_string("process_not_found"));

        char msg[128];
        snprintf(msg, sizeof(msg), "Process '%s' not found", pss->proc_name);
        json_object_set_new(err, "message", json_string(msg));

        /* Serialize error object to a temporary JSON buffer */
        char err_buf[256];
        int err_len = json_dumpb(err, err_buf, sizeof(err_buf), JSON_COMPACT);
        json_decref(err);

        if (err_len < 0 || (size_t)err_len > sizeof(err_buf)) {
          break;
        }
        /* Append serialized error JSON fragment to the response buffer */
        int ret = snprintf(json + json_len, sizeof(json) - json_len, ", \"error\": %.*s", err_len, err_buf);
        if (ret < 0 || (size_t)ret >= sizeof(json) - json_len) {
          syslog(LOG_ERR, "JSON message truncated, dropping the frame");
          break;
        }
        json_len += ret;
      }
    }
    /* Truncated output! */
    if ((size_t)json_len >= sizeof(json)) {
      syslog(LOG_ERR, "JSON message truncated, dropping the frame");
      break;
    }
    /* Close JSON object */
    if ((size_t)json_len + 1 >= sizeof(json)) {
      syslog(LOG_ERR, "JSON message truncated, dropping the frame");
      break;
    }
    json[json_len++] = '}';
    json[json_len] = '\0';

    /* Copy JSON to per-session buffer */
    memcpy(&pss->stream_buf[LWS_PRE], json, (size_t)json_len);

    /* Send one complete WS text message */
    int written = lws_write(wsi, &pss->stream_buf[LWS_PRE], (size_t)json_len, LWS_WRITE_TEXT);
    if (written < 0) {
      syslog(LOG_WARNING, "lws_write failed");
      break;
    }
    if (written != json_len) {
      /* Short write: do not attempt to send the remainder as a new TEXT frame */
      syslog(LOG_WARNING, "short write: %d of %d", written, json_len);
    }
    break;
  }

  case LWS_CALLBACK_WSI_DESTROY: {
    struct per_session_data *pss = user;
    /*
     * Handshake-failure cleanup:
     *
     * FILTER_PROTOCOL_CONNECTION is not guaranteed to be paired with
     * ESTABLISHED or CLOSED on all libwebsockets failure paths.
     *
     * If this session never reached ESTABLISHED, it still holds a
     * pending slot that must be released here.
     */
    if (pss && !pss->counted) {
      if (ws_pending_client_count > 0) {
        ws_pending_client_count--;
      }
    }
    break;
  }

  default:
    break;
  }

  return 0;
}

/******************************************************************************/

static const struct lws_protocols protocols[] = { {
                                                      .name = "sysstats",
                                                      .callback = ws_callback,
                                                      .per_session_data_size = sizeof(struct per_session_data),
                                                  },
                                                  { NULL, NULL, 0, 0, 0, NULL, 0 } };

/* Periodic GLib timer callback that updates the global system statistics.
 *
 * This runs in the GLib main loop thread and refreshes latest_stats.
 * The data is later consumed by the WebSocket write
 * callback when sending updates to connected clients.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
static gboolean
stats_timer_cb(gpointer user_data)
{
  (void)user_data;

  /* Read stats */
  read_cpu_stats(&latest_stats);
  read_mem_stats(&latest_stats);
  read_uptime_load(&latest_stats);
  /* Wall-clock timestamp (real time) */
  latest_stats.timestamp_ms = get_time_ms(CLOCK_REALTIME);
  /* Previous monotonic timestamp for delta calculation */
  static uint64_t prev_mono_ms = 0;
  /* Current monotonic timestamp (not affected by clock adjustments) */
  uint64_t now_mono_ms = get_time_ms(CLOCK_MONOTONIC);
  /* Store monotonic time for consumers that need stable timing */
  latest_stats.monotonic_ms = now_mono_ms;
  /* Compute elapsed time since last sample using monotonic clock */
  if (prev_mono_ms != 0 && now_mono_ms >= prev_mono_ms) {
    latest_stats.delta_ms = now_mono_ms - prev_mono_ms;
  } else {
    /* First sample */
    latest_stats.delta_ms = 0;
  }
  /* Update previous monotonic timestamp for next interval */
  prev_mono_ms = now_mono_ms;

  return G_SOURCE_CONTINUE;
}

/* Periodic GLib timer callback that drives libwebsockets from the GLib main loop.
 *
 * libwebsockets is not automatically integrated with GLib, so we call
 * lws_service() periodically to allow it to process network events.
 *
 * The timeout argument (1ms) is the maximum time lws_service() may block
 * while waiting for network activity.
 *
 * Returning G_SOURCE_CONTINUE keeps the timer active.
 */
static gboolean
lws_glib_service(gpointer user_data)
{
  struct lws_context *context = user_data;

  /* Service libwebsockets may block up to 1ms */
  lws_service(context, 1);

  return G_SOURCE_CONTINUE;
}

/* Graceful shutdown handling:
 *
 * - Unix signals are integrated into the GLib main loop.
 * - Periodic timers are explicitly stopped before quitting the loop.
 * - No libwebsockets APIs are called after lws_context_destroy().
 */
static gboolean
on_unix_signal(gpointer user_data)
{
  GMainLoop *main_loop = user_data;

  /* Stop periodic timers to allow clean shutdown */
  if (stats_timer_id != 0) {
    g_source_remove(stats_timer_id);
    stats_timer_id = 0;
  }
  if (lws_service_timer_id != 0) {
    g_source_remove(lws_service_timer_id);
    lws_service_timer_id = 0;
  }
  if (main_loop) {
    g_main_loop_quit(main_loop);
  }

  return G_SOURCE_REMOVE;
}

/******************************************************************************/

int
main(int argc, char **argv)
{
  AXParameter *parameter = NULL;
  GError *error = NULL;
  int ret = 0;
  struct lws_context_creation_info info;
  int ws_port = WS_PORT_DEFAULT;

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Parse input options */
  int opt;
  while ((opt = getopt(argc, argv, "p:")) != -1) {
    switch (opt) {
    case 'p':
      ws_port = atoi(optarg);
      if (ws_port <= 0 || ws_port > 65535) {
        syslog(LOG_ERR, "Invalid port: %s", optarg);
        return EXIT_FAILURE;
      }
      break;
    default:
      syslog(LOG_ERR, "Usage: %s [-p port]", argv[0]);
      return EXIT_FAILURE;
    }
  }

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Handle Unix signals for graceful termination */
  g_unix_signal_add(SIGINT, on_unix_signal, main_loop);
  g_unix_signal_add(SIGTERM, on_unix_signal, main_loop);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "%s starting WebSocket backend.", APP_NAME);

  /* Create AXParameter */
  parameter = ax_parameter_new(APP_NAME, &error);
  if (parameter == NULL) {
    syslog(LOG_WARNING, "Failed to create parameter: %s", error->message);
    ret = -1;
    goto exit;
  }

  /* Set ApplicationRunning to yes */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "yes", true, &error)) {
    syslog(LOG_WARNING, "Failed to set parameter %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
  }
  if (error) {
    g_error_free(error);
    error = NULL;
  }

  /* Create WebSocket context */
  memset(&info, 0, sizeof(info));
  info.port = ws_port;
  info.protocols = protocols;
  info.gid = -1;
  info.uid = -1;

  /* Set log level to error and warning only */
  lws_set_log_level(LLL_ERR | LLL_WARN, NULL);

  lws_ctx = lws_create_context(&info);
  if (!lws_ctx) {
    syslog(LOG_ERR, "Failed to create libwebsockets context");
    ret = -1;
    goto exit;
  }
  /* Cache the number of online CPUs once.
   *
   * The value is constant for the lifetime of the process on typical
   * embedded systems, so caching avoids repeated sysconf() calls.
   * Fallback to 1 ensures safe division if sysconf() fails.
   */
  cpu_core_count = sysconf(_SC_NPROCESSORS_ONLN);
  if (cpu_core_count <= 0) {
    syslog(LOG_WARNING, "sysconf(_SC_NPROCESSORS_ONLN) failed, defaulting to 1 CPU");
    cpu_core_count = 1;
  }
  syslog(LOG_INFO, "Detected %ld CPU core(s)", cpu_core_count);

  /* Initialize latest_stats and establish CPU usage baseline */
  read_cpu_stats(&latest_stats);
  read_mem_stats(&latest_stats);

  /* Drive libwebsockets and system statistics from the GLib main loop.
   *
   * - lws_glib_service(): periodically services libwebsockets so it can
   *   process network events and invoke protocol callbacks.
   * - stats_timer_cb(): periodically polls system statistics and
   *   updates latest_stats. This function is started/stopped dynamically based
   *   on whether there are any connected WebSocket clients.
   */
  lws_service_timer_id = g_timeout_add(10, lws_glib_service, lws_ctx);

  syslog(LOG_INFO, "WebSocket server listening on port %d", ws_port);

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Set ApplicationRunning to no */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "no", true, &error)) {
    syslog(LOG_WARNING, "Failed to set parameter %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
  }
  if (error) {
    g_error_free(error);
    error = NULL;
  }

exit:
  syslog(LOG_INFO, "Terminating %s backend.", APP_NAME);
  /* Cleanup WebSocket context */
  if (lws_ctx) {
    lws_context_destroy(lws_ctx);
    lws_ctx = NULL;
  }
  /* Unref the main loop */
  if (main_loop) {
    g_main_loop_unref(main_loop);
    main_loop = NULL;
  }
  /* Free axparameter */
  if (parameter) {
    ax_parameter_free(parameter);
  }
  /* Close application logging to syslog */
  closelog();

  return ret ? EXIT_FAILURE : EXIT_SUCCESS;
}
