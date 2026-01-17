#include <syslog.h>
#include <glib.h>

#include <axsdk/axparameter.h>

#include "platform.h"

#define PARAM_NAME_APPLICATION_RUNNING_PARAM "ApplicationRunning"

static AXParameter *parameter = NULL;

bool
platform_status_start(void)
{
  GError *error = NULL;

  /* Create AXParameter */
  parameter = ax_parameter_new(APP_NAME, &error);
  if (!parameter) {
    syslog(LOG_WARNING, "Failed to create AXParameter: %s", error->message);
    g_error_free(error);
    return false;
  }
  /* Set ApplicationRunning to yes */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "yes", true, &error)) {
    syslog(LOG_WARNING, "Failed to set %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
    g_error_free(error);
  }

  return true;
}

void
platform_status_stop(void)
{
  GError *error = NULL;

  if (!parameter) {
    return;
  }
  /* Set ApplicationRunning to no */
  if (!ax_parameter_set(parameter, PARAM_NAME_APPLICATION_RUNNING_PARAM, "no", true, &error)) {
    syslog(LOG_WARNING, "Failed to clear %s: %s", PARAM_NAME_APPLICATION_RUNNING_PARAM, error->message);
    g_error_free(error);
  }
  ax_parameter_free(parameter);
  parameter = NULL;
}
