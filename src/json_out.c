#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include <syslog.h>
#include <jansson.h>

#include "json_out.h"
#include "storage.h"
#include "proc.h"
#include "ws_limits.h"

size_t
build_stats_json(char *out_buf,
                 size_t out_size,
                 const struct sys_stats *stats,
                 long cpu_core_count,
                 unsigned int connected_clients,
                 unsigned int max_clients,
                 struct per_session_data *pss,
                 bool *truncated)
{
  int json_len;

  if (truncated) {
    *truncated = false;
  }

  /* Construct the JSON response */
  json_len = snprintf(out_buf,
                      out_size,
                      "{ \"ts\": %" PRIu64 ", \"mono_ms\": %" PRIu64 ", \"delta_ms\": %" PRIu64 ", \"cpu\": %.2f"
                      ", \"cpu_cores\": %ld"
                      ", \"mem_total_kb\": %ld"
                      ", \"mem_available_kb\": %ld"
                      ", \"uptime_s\": %.0f"
                      ", \"load1\": %.2f"
                      ", \"load5\": %.2f"
                      ", \"load15\": %.2f"
                      ", \"clients\": { \"connected\": %u, \"max\": %u }",
                      stats->timestamp_ms,
                      stats->monotonic_ms,
                      stats->delta_ms,
                      stats->cpu_usage,
                      cpu_core_count,
                      stats->mem_total_kb,
                      stats->mem_available_kb,
                      stats->uptime_s,
                      stats->load1,
                      stats->load5,
                      stats->load15,
                      connected_clients,
                      max_clients);
  if (json_len < 0 || (size_t)json_len >= out_size) {
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }
  /* Monitor a process */
  if (pss->proc_enabled) {
    double proc_cpu = 0.0;
    long proc_rss_kb = 0;
    long proc_pss_kb = 0;
    long proc_uss_kb = 0;
    pid_t proc_pid = 0;

    /* Read the process stats */
    if (read_process_stats(
            pss->proc_name, pss, stats->monotonic_ms, &proc_cpu, &proc_rss_kb, &proc_pss_kb, &proc_uss_kb, &proc_pid)) {
      json_t *proc = json_object();
      if (!proc) {
        if (truncated) {
          *truncated = true;
        }
        return 0;
      }
      /* Populate process statistics */
      json_object_set_new(proc, "name", json_string(pss->proc_name));
      json_object_set_new(proc, "cpu", json_real(proc_cpu));
      json_object_set_new(proc, "rss_kb", json_integer(proc_rss_kb));
      json_object_set_new(proc, "pss_kb", json_integer(proc_pss_kb));
      json_object_set_new(proc, "uss_kb", json_integer(proc_uss_kb));
      json_object_set_new(proc, "pid", json_integer(proc_pid));

      /* Serialize process object to a temporary JSON buffer */
      char proc_buf[256];
      int proc_len = json_dumpb(proc, proc_buf, sizeof(proc_buf), JSON_COMPACT);
      json_decref(proc);

      if (proc_len < 0 || (size_t)proc_len > sizeof(proc_buf)) {
        if (truncated) {
          *truncated = true;
        }
        return 0;
      }
      /* Append serialized process JSON fragment to the response buffer */
      int ret = snprintf(out_buf + json_len, out_size - json_len, ", \"proc\": %.*s", proc_len, proc_buf);
      if (ret < 0 || (size_t)ret >= out_size - json_len) {
        syslog(LOG_ERR, "JSON message truncated, dropping the frame");
        if (truncated) {
          *truncated = true;
        }
        return 0;
      }
      json_len += ret;
    } else {
      /* Process not found */
      json_t *err = json_object();
      if (!err) {
        if (truncated) {
          *truncated = true;
        }
        return 0;
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
        if (truncated) {
          *truncated = true;
        }
        return 0;
      }
      /* Append serialized error JSON fragment to the response buffer */
      int ret = snprintf(out_buf + json_len, out_size - json_len, ", \"error\": %.*s", err_len, err_buf);
      if (ret < 0 || (size_t)ret >= out_size - json_len) {
        syslog(LOG_ERR, "JSON message truncated, dropping the frame");
        if (truncated) {
          *truncated = true;
        }
        return 0;
      }
      json_len += ret;
    }
  }
  /* Truncated output! */
  if ((size_t)json_len >= out_size) {
    syslog(LOG_ERR, "JSON message truncated, dropping the frame");
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }
  /* Close JSON object */
  if ((size_t)json_len + 1 >= out_size) {
    syslog(LOG_ERR, "JSON message truncated, dropping the frame");
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }
  out_buf[json_len++] = '}';
  out_buf[json_len] = '\0';

  return (size_t)json_len;
}

size_t
build_process_list_json(char *out_buf, size_t out_size, bool *truncated)
{
  /* Buffer for a deduplicated snapshot of process names read from /proc/<pid>/comm */
  char proc_names[MAX_PROCESS_COUNT][MAX_PROC_NAME_LENGTH];
  size_t proc_count = collect_process_list(proc_names, MAX_PROCESS_COUNT);

  json_t *resp = json_object();
  json_t *arr = json_array();

  if (truncated) {
    *truncated = false;
  }

  if (!resp || !arr) {
    if (arr) {
      json_decref(arr);
    }
    if (resp) {
      json_decref(resp);
    }
    return 0;
  }

  /* Populate process array */
  for (size_t i = 0; i < proc_count; i++) {
    if (json_array_append_new(arr, json_string(proc_names[i])) != 0) {
      syslog(LOG_WARNING, "Failed to append process name to JSON array");
      if (truncated) {
        *truncated = true;
      }
      break;
    }
  }
  json_object_set_new(resp, "processes", arr);

  /* Serialize into fixed buffer, truncate by dropping tail entries */
  for (;;) {
    /* Serialize JSON into the fixed buffer (fails if it does not fit) */
    int out_len = json_dumpb(resp, out_buf, out_size, JSON_COMPACT);
    /* Write the output */
    if (out_len >= 0) {
      json_decref(resp);
      return (size_t)out_len;
    }
    /* Too big (or other failure): try truncating the array */
    size_t n = json_array_size(arr);
    if (n == 0) {
      syslog(LOG_WARNING, "Failed to serialize process list JSON (buffer %zu bytes)", out_size);
      json_decref(resp);
      return 0;
    }
    json_array_remove(arr, n - 1);
    if (truncated) {
      *truncated = true;
    }
  }
}

size_t
build_storage_json(char *out_buf, size_t out_size, bool *truncated)
{
  struct storage_info storage[MAX_STORAGE_MOUNTS];
  size_t storage_count = collect_storage_info(storage, MAX_STORAGE_MOUNTS);

  json_t *resp = json_object();
  json_t *arr = json_array();

  if (truncated) {
    *truncated = false;
  }

  if (!resp || !arr) {
    if (arr) {
      json_decref(arr);
    }
    if (resp) {
      json_decref(resp);
    }
    return 0;
  }

  /* Populate storage array */
  for (size_t i = 0; i < storage_count; i++) {
    json_t *obj = json_object();
    if (!obj) {
      if (truncated) {
        *truncated = true;
      }
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
      if (truncated) {
        *truncated = true;
      }
      break;
    }
  }
  json_object_set_new(resp, "storage", arr);

  /* Serialize into fixed buffer, truncate by dropping tail entries */
  for (;;) {
    /* Serialize JSON into the fixed buffer (fails if it does not fit) */
    int out_len = json_dumpb(resp, out_buf, out_size, JSON_COMPACT);
    /* Write the output */
    if (out_len >= 0) {
      json_decref(resp);
      return (size_t)out_len;
    }
    /* Too big (or other failure): try truncating the array */
    size_t n = json_array_size(arr);
    if (n == 0) {
      syslog(LOG_WARNING, "Failed to serialize storage JSON (buffer %zu bytes)", out_size);
      json_decref(resp);
      return 0;
    }
    json_array_remove(arr, n - 1);
    if (truncated) {
      *truncated = true;
    }
  }
}
