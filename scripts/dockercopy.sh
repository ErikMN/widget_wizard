#!/bin/bash
#
# Copy multiple files or directories from a Docker container to the host
#
# Example usage:
#   ./dockercopy.sh my_docker_img /opt/app/my_app
#

# Print colors:
FMT_RED=$(printf '\033[31m')
FMT_GREEN=$(printf '\033[32m')
FMT_YELLOW=$(printf '\033[33m')
FMT_BOLD=$(printf '\033[1m')
FMT_RESET=$(printf '\033[0m')

# Check if at least IMAGE_NAME and one CONTAINER_PATH are provided as arguments:
if [ $# -lt 2 ]; then
  echo "${FMT_RED}Error: Not enough arguments provided.${FMT_RESET}"
  echo "Usage: $0 <IMAGE_NAME> <CONTAINER_PATH1> [CONTAINER_PATH2 ...]"
  exit 1
fi

IMAGE_NAME=$1
shift
# Remaining arguments are file or directory names:
CONTAINER_PATHS=("$@")

# Get the absolute path of the script's directory:
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# Set the output directory to the parent directory (one level up):
OUTPUT_DIR=$(cd "$SCRIPT_DIR/.." && pwd) || exit 1

# Create a temporary container from the specified image:
CONTAINER_ID=$(docker create "$IMAGE_NAME") || {
  echo "${FMT_RED}Error: Failed to create temporary container${FMT_RESET}"
  exit 1
}

# Function to clean up the container:
cleanup() {
  echo "${FMT_YELLOW}Cleaning up temporary container...${FMT_RESET}"
  if [ -n "$CONTAINER_ID" ]; then
    docker rm "$CONTAINER_ID" >/dev/null 2>&1 || {
      echo "${FMT_RED}Warning: Failed to remove temporary container${FMT_RESET}"
    }
  fi
}

# Ensure the container is removed on script exit:
trap cleanup EXIT

# Copy each specified file or directory from the temporary container to the parent directory:
for CONTAINER_PATH in "${CONTAINER_PATHS[@]}"; do
  # Extract the file or directory name from the CONTAINER_PATH path:
  CONTAINER_PATH_BASENAME=$(basename "$CONTAINER_PATH")

  # Check if the specified file or directory already exists in the parent directory:
  if [ ! -e "$OUTPUT_DIR/$CONTAINER_PATH_BASENAME" ]; then
    # Attempt to copy the specified file or directory from the temporary container to the parent directory:
    if docker cp "$CONTAINER_ID:$CONTAINER_PATH" "$OUTPUT_DIR"; then
      echo "${FMT_BOLD}${FMT_GREEN}Successfully copied '$CONTAINER_PATH' to $OUTPUT_DIR/$CONTAINER_PATH_BASENAME from $IMAGE_NAME${FMT_RESET}"
    else
      echo "${FMT_RED}Error: Failed to copy $CONTAINER_PATH${FMT_RESET}"
      # Continue with the next file or directory
    fi
  else
    echo "${FMT_BOLD}${FMT_YELLOW}The '$CONTAINER_PATH' file or directory already exists in the parent directory.${FMT_RESET}"
  fi
done
