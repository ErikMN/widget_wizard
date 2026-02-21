
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <sys/statvfs.h>

#include "storage.h"

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
  while (fscanf(f, "%127s %255s %31s %*s %*d %*d", mount_dev, mount_point, type) == 3) {
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
  if (block_size == 0) {
    /* Some filesystems report f_frsize as 0: fall back to f_bsize in that case */
    block_size = vfs.f_bsize;
  }

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
size_t
collect_storage_info(struct storage_info *out, size_t max_entries)
{
  size_t count = 0;
  size_t path_count = sizeof(storage_paths) / sizeof(storage_paths[0]);

  if (!out || max_entries == 0) {
    return 0;
  }
  for (size_t i = 0; i < path_count; i++) {
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
