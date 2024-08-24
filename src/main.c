#include <stdio.h>
#include <ctype.h>
#include <stdlib.h>
#include <unistd.h>
#include <libgen.h>
#include <errno.h>
#include <string.h>
#include <getopt.h>
#include <sys/types.h>
#include <stdbool.h>
#include <sys/stat.h>
#include <limits.h>
#include <assert.h>
#include <stdint.h>
#include <math.h>
#include <syslog.h>
#include <gio/gio.h>
#include <glib/gstdio.h>

#include "common.h"

static GMainLoop *main_loop = NULL;

static void
handle_sigterm(int signo)
{
  (void)signo;
  g_main_loop_quit(main_loop);
}

static void
init_signals(void)
{
  struct sigaction sa;
  sa.sa_flags = 0;
  sigemptyset(&sa.sa_mask);
  sa.sa_handler = handle_sigterm;
  sigaction(SIGTERM, &sa, NULL);
  sigaction(SIGINT, &sa, NULL);
}

int
main(int argc, char **argv)
{
  (void)argc;
  (void)argv;

  printf("\nHello World!\n");
  printf("%s:%d\n", __FILE__, __LINE__);

  print_debug("\n*** Development build\n");
  print_debug("Build: %s %s\n", __DATE__, __TIME__);

  init_signals();

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "Starting %s", APP_NAME);

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Unref the main loop */
  g_main_loop_unref(main_loop);

  syslog(LOG_INFO, "Terminating %s", APP_NAME);

  /* Close application logging to syslog */
  closelog();

  return EXIT_SUCCESS;
}
