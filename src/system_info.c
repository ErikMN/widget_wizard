#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/utsname.h>

#include "system_info.h"
#include "proc.h"

/* Strip surrounding double quotes if present */
static void
strip_quotes(char *s)
{
  size_t len;

  if (!s) {
    return;
  }

  len = strlen(s);
  if (len >= 2 && s[0] == '"' && s[len - 1] == '"') {
    memmove(s, s + 1, len - 2);
    s[len - 2] = '\0';
  }
}

/* Best-effort parse of /etc/os-release */
static void
read_os_release(struct system_info *out)
{
  FILE *f;
  char line[256];

  if (!out) {
    return;
  }

  f = fopen("/etc/os-release", "r");
  if (!f) {
    /* Fallback path */
    f = fopen("/usr/lib/os-release", "r");
    if (!f) {
      return;
    }
  }

  while (fgets(line, sizeof(line), f)) {
    char *eq;

    /* Skip comments and empty lines */
    if (line[0] == '#' || line[0] == '\n') {
      continue;
    }

    line[strcspn(line, "\n")] = '\0';

    eq = strchr(line, '=');
    if (!eq) {
      continue;
    }
    *eq = '\0';
    char *key = line;
    char *value = eq + 1;

    strip_quotes(value);

    if (strcmp(key, "NAME") == 0) {
      strncpy(out->os_name, value, sizeof(out->os_name) - 1);
      out->os_name[sizeof(out->os_name) - 1] = '\0';
    } else if (strcmp(key, "VERSION") == 0) {
      strncpy(out->os_version, value, sizeof(out->os_version) - 1);
      out->os_version[sizeof(out->os_version) - 1] = '\0';
    } else if (strcmp(key, "PRETTY_NAME") == 0) {
      strncpy(out->os_pretty_name, value, sizeof(out->os_pretty_name) - 1);
      out->os_pretty_name[sizeof(out->os_pretty_name) - 1] = '\0';
    }
  }
  fclose(f);
}

bool
read_system_info(struct system_info *out)
{
  struct utsname u;

  if (!out) {
    return false;
  }

  memset(out, 0, sizeof(*out));

  /* Read kernel release, version, and machine architecture */
  if (uname(&u) != 0) {
    return false;
  }

  strncpy(out->kernel_release, u.release, sizeof(out->kernel_release) - 1);
  strncpy(out->kernel_version, u.version, sizeof(out->kernel_version) - 1);
  strncpy(out->machine, u.machine, sizeof(out->machine) - 1);

  /* Read system hostname */
  if (gethostname(out->hostname, sizeof(out->hostname)) != 0) {
    out->hostname[0] = '\0';
  } else {
    /* Ensure NUL termination if truncated */
    out->hostname[sizeof(out->hostname) - 1] = '\0';
  }

  /* Best-effort OS identification */
  read_os_release(out);

  /* Also set the CPU core count in system info for good measure */
  out->cpu_core_count = proc_get_cpu_core_count();

  return true;
}
