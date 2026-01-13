#pragma once

#include <stddef.h>

#include "proc.h"

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

struct storage_info {
  char path[MAX_PROC_PATH_LENGTH];
  char fs_type[32]; /* Filesystem type (e.g. ext4, tmpfs) */
  unsigned long long total_kb;
  unsigned long long used_kb;
  unsigned long long available_kb;
};

/* Collect one-shot storage information for a bounded set of mount points.
 *
 * - Iterates the static storage_paths allowlist and probes each path with statvfs().
 * - Paths that do not exist or cannot be queried are skipped.
 * - Collection stops when max_entries have been written to the output array.
 *
 * Returns:
 * - Number of storage_info entries written to out.
 */
size_t collect_storage_info(struct storage_info *out, size_t max_entries);
