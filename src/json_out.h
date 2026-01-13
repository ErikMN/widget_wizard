#pragma once

#include <stddef.h>
#include <stdbool.h>

#include "stats.h"
#include "session.h"

/* Build one WebSocket JSON snapshot.
 *
 * Returns:
 *   number of bytes written to out_buf (not including NUL)
 *
 * If the JSON did not fit into out_buf, *truncated is set to true and
 * the returned data must not be sent.
 */
size_t build_stats_json(char *out_buf,
                        size_t out_size,
                        const struct sys_stats *stats,
                        long cpu_core_count,
                        unsigned int connected_clients,
                        unsigned int max_clients,
                        struct per_session_data *pss,
                        bool *truncated);

/* Build one-shot process list JSON.
 *
 * Output format:
 *   { "processes": [ "name1", "name2", ... ] }
 *
 * The list may be truncated to fit into out_buf.
 */
size_t build_process_list_json(char *out_buf, size_t out_size, bool *truncated);

/* Build one-shot storage JSON.
 *
 * Output format:
 *   { "storage": [ { ... }, { ... } ] }
 *
 * The list may be truncated to fit into out_buf.
 */
size_t build_storage_json(char *out_buf, size_t out_size, bool *truncated);
