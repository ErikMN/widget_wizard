#include <dirent.h>
#include <string.h>
#include <sys/stat.h>

#include "cgi_discovery.h"

/* CGIs to list */
// clang-format off
static const char *cgi_paths[] = {
  "/usr/html/axis-cgi",
  "/usr/html/onvif-cgi",
  "/usr/bin",
  "/usr/sbin"
};
// clang-format on

static bool
is_executable_cgi(const char *dir, const char *name)
{
  char full[MAX_PROC_PATH_LENGTH];
  struct stat st;

  if (!name || !strstr(name, ".cgi")) {
    return false;
  }

  snprintf(full, sizeof(full), "%s/%s", dir, name);

  if (stat(full, &st) != 0) {
    return false;
  }

  if (!S_ISREG(st.st_mode)) {
    return false;
  }

  if (!(st.st_mode & S_IXUSR)) {
    return false;
  }

  return true;
}

size_t
collect_cgi_list(char paths[][MAX_PROC_PATH_LENGTH], size_t max_entries)
{
  size_t count = 0;

  for (size_t i = 0; i < sizeof(cgi_paths) / sizeof(cgi_paths[0]); i++) {
    DIR *d = opendir(cgi_paths[i]);
    if (!d) {
      continue;
    }

    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
      if (count >= max_entries) {
        break;
      }

      if (ent->d_name[0] == '.') {
        continue;
      }

      if (!is_executable_cgi(cgi_paths[i], ent->d_name)) {
        continue;
      }

      size_t dir_len = strlen(cgi_paths[i]);
      size_t name_len = strlen(ent->d_name);
      if (dir_len + 1 + name_len + 1 > MAX_PROC_PATH_LENGTH) {
        continue;
      }

      snprintf(paths[count], MAX_PROC_PATH_LENGTH, "%s/%s", cgi_paths[i], ent->d_name);

      paths[count][MAX_PROC_PATH_LENGTH - 1] = '\0';
      count++;
    }
    closedir(d);

    if (count >= max_entries) {
      break;
    }
  }

  return count;
}
