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
#include <glib/gstdio.h>

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

  init_signals();

  main_loop = g_main_loop_new(NULL, FALSE);

  /* Open the syslog to report messages for the app */
  openlog(APP_NAME, LOG_PID | LOG_CONS, LOG_USER);

  /* Choose between { LOG_INFO, LOG_CRIT, LOG_WARN, LOG_ERR } */
  syslog(LOG_INFO, "%s ACAP does not have any backend; entering idle state.", APP_NAME);

  /* Start the main loop */
  g_main_loop_run(main_loop);

  /* Unref the main loop */
  g_main_loop_unref(main_loop);

  syslog(LOG_INFO, "Terminating %s dummy backend.", APP_NAME);

  /* Close application logging to syslog */
  closelog();

  return EXIT_SUCCESS;
}
