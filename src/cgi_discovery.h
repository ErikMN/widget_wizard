#pragma once

#include <stddef.h>
#include <stdio.h>

#include "proc.h"

/* Collect CGI executables from allowlisted paths.
 *
 * - Scans fixed directories only.
 * - No recursion beyond one level.
 * - Matches files ending in ".cgi".
 * - Requires executable bit.
 *
 * Returns number of entries written.
 */
size_t collect_cgi_list(char paths[][MAX_PROC_PATH_LENGTH], size_t max_entries);
