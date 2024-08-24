#!/bin/bash
#
# logs - stream logs from target
#
# Connect to $TARGET_IP with default password and display system journal in --follow mode.
#
# This tools runs forever, trying to establish a connection to target and trying to re-establish
# the connection again if it fails. So you can keep a window open which always shows the logs of
# your device.

set -eu

[ -z "$TARGET_IP" ] && echo 'set TARGET_IP' 1>&2 && exit 1

if ! which sshpass >/dev/null; then
  echo 'sshpass not found' 1>&2
  exit 1
fi

# Clean up and exit
cleanup() {
  echo "-- Stopping the script and closing the connection --"
  exit
}

# Trap Ctrl+C (SIGINT) and call the cleanup function
trap cleanup SIGINT

# Without the -t option ssh will not allocate a pseudo-terminal for stdout, so
# journalctl disabled colorized output based on log line priority. Re-enable it
# if we are in fact printing to a terminal locally.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  use_color=yes
fi

ts="$(date +%s)"
first=y

while :; do
  # If we lose the connection (ssh error return) then try to reconnect again after a few seconds
  sshpass -ppass \
    ssh \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o ForwardX11=no \
    -o ConnectTimeout=5 \
    -o ServerAliveInterval=5 \
    -o ServerAliveCountMax=1 \
    -q \
    "root@$TARGET_IP" \
    "${use_color+SYSTEMD_COLORS=true} journalctl --follow $@" ||
    true

  # Print a disconnect warning only if a certain amount of time passed since last disconnect
  # or if we never got a connection in the first place (but keep trying)
  new_ts="$(date +%s)"
  ts_diff="$(("$new_ts" - "$ts"))"

  if [ -n "$first" -a "$ts_diff" -lt 10 ]; then
    echo "-- No connection to $TARGET_IP, will keep trying to connect --" 1>&2
  elif [ "$ts_diff" -gt 10 ]; then
    echo "-- Lost connection to $TARGET_IP, trying to reconnect --" 1>&2
  fi

  ts="$new_ts"
  first=
done
