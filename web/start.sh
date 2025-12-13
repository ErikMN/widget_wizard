#!/bin/bash

# Save the current directory to return later:
original_dir=$(pwd)

# Determine the project root directory:
project_root_dir="$(dirname "$0")"

# Source version.sh:
# shellcheck disable=SC1091
. "${project_root_dir}/version.sh"

# Abort if credentials are not set:
if [ -z "$TARGET_IP" ]; then
  echo "Error: TARGET_IP is not set. Source setuptarget.sh first"
  exit 1
fi

# Export environment variables required by React:
export VITE_TARGET_IP=$TARGET_IP

# Return to the original directory:
cd "$original_dir" || exit 1

# Start the React application:
vite
