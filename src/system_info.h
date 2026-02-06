#pragma once

#include <stdbool.h>

#define MAX_SYSINFO_FIELD 128

struct system_info {
  /* Kernel and hardware identification from uname() */
  char kernel_release[MAX_SYSINFO_FIELD];
  char kernel_version[MAX_SYSINFO_FIELD];
  char machine[MAX_SYSINFO_FIELD];

  /* OS identification from /etc/os-release */
  char os_name[MAX_SYSINFO_FIELD];
  char os_version[MAX_SYSINFO_FIELD];
  char os_pretty_name[MAX_SYSINFO_FIELD];

  /* System hostname */
  char hostname[MAX_SYSINFO_FIELD];
};

/* Read one-shot system information.
 *
 * Returns true on success, false on failure.
 */
bool read_system_info(struct system_info *out);
