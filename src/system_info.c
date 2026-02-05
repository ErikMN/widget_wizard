#include <string.h>
#include <sys/utsname.h>

#include "system_info.h"

bool
read_system_info(struct system_info *out)
{
  struct utsname u;

  if (!out) {
    return false;
  }

  memset(out, 0, sizeof(*out));

  if (uname(&u) != 0) {
    return false;
  }

  strncpy(out->kernel_release, u.release, sizeof(out->kernel_release) - 1);
  strncpy(out->kernel_version, u.version, sizeof(out->kernel_version) - 1);
  strncpy(out->machine, u.machine, sizeof(out->machine) - 1);

  return true;
}
