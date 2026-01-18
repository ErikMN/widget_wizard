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
  json_t *resp = NULL;
  json_t *clients = NULL;

  if (truncated) {
    *truncated = false;
  }

  if (!out_buf || out_size == 0 || !stats || !pss) {
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }

  /* Root JSON object */
  resp = json_object();
  if (!resp) {
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }

  /* Populate system statistics */
  json_object_set_new(resp, "ts", json_integer(stats->timestamp_ms));
  json_object_set_new(resp, "mono_ms", json_integer(stats->monotonic_ms));
  json_object_set_new(resp, "delta_ms", json_integer(stats->delta_ms));
  json_object_set_new(resp, "cpu", json_real(stats->cpu_usage));
  json_object_set_new(resp, "cpu_cores", json_integer(cpu_core_count));
  json_object_set_new(resp, "mem_total_kb", json_integer(stats->mem_total_kb));
  json_object_set_new(resp, "mem_available_kb", json_integer(stats->mem_available_kb));
  json_object_set_new(resp, "uptime_s", json_real(stats->uptime_s));
  json_object_set_new(resp, "load1", json_real(stats->load1));
  json_object_set_new(resp, "load5", json_real(stats->load5));
  json_object_set_new(resp, "load15", json_real(stats->load15));

  /* Clients object */
  clients = json_object();
  if (!clients) {
    json_decref(resp);
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }
  json_object_set_new(clients, "connected", json_integer(connected_clients));
  json_object_set_new(clients, "max", json_integer(max_clients));
  json_object_set_new(resp, "clients", clients);

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
        json_decref(resp);
        /* Truncated output! */
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
      json_object_set_new(resp, "proc", proc);
    } else {
      /* Process not found */
      json_t *err = json_object();
      if (!err) {
        json_decref(resp);
        /* Truncated output! */
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
      json_object_set_new(resp, "error", err);
    }
  }
  /* Serialize into output buffer */
  int out_len = json_dumpb(resp, out_buf, out_size, JSON_COMPACT);
  json_decref(resp);

  if (out_len < 0) {
    if (truncated) {
      *truncated = true;
    }
    return 0;
  }

  return (size_t)out_len;
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
