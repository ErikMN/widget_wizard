#!/bin/sh
set -e

# Choose directory mode (1 = script's directory, 0 = current working directory)
USE_SCRIPT_DIR=0

# Determine the directory to use
if [ "$USE_SCRIPT_DIR" -eq 1 ]; then
  d="$(cd "$(dirname "$0")" && pwd)"
else
  d="$(pwd)"
fi

# NOTE: might have to remove -t (pseudo-TTY) for Jenkins
USE_TTY=1
if [ "$USE_TTY" -eq 1 ]; then
  TTY_OPTION="-t"
else
  TTY_OPTION=""
fi

# Ensure necessary environment variables are set
: "${TARGET_IP:?TARGET_IP environment variable is not set}"
: "${TARGET_USR:?TARGET_USR environment variable is not set}"
: "${TARGET_PWD:?TARGET_PWD environment variable is not set}"

# Ensure the .yarnrc file exists
touch "$d/.yarnrc"

run_docker() {
  docker run --rm -i $TTY_OPTION \
    -e TARGET_IP="$TARGET_IP" \
    -e TARGET_USR="$TARGET_USR" \
    -e TARGET_PWD="$TARGET_PWD" \
    -e HOME="$d" \
    -w "$d" \
    -u "$(id -u):$(id -g)" \
    -v "$d:$d" \
    -v /etc/passwd:/etc/passwd:ro \
    -v /etc/group:/etc/group:ro \
    -v "$d/.yarnrc:$d/.yarnrc" \
    "$@"
}

run_docker "$@"
