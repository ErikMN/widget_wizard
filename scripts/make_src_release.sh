#!/usr/bin/env bash
set -e

# Remove old release first:
rm -rf release

# Get latest git tag and replace '.' with '_':
GIT_TAG=$(git tag | sort -V | tail -n 1 | tr '.' '_')
if [ -z "$GIT_TAG" ]; then
  echo "Error: No git tags found." >&2
  exit 1
fi

REPO_NAME=$(basename -s .git "$(git config --get remote.origin.url)")
OUTPUT="release/${REPO_NAME}_$GIT_TAG"
echo "*** Creating release $OUTPUT"

# Exclude stuff from release:
EXCLUDE_PATTERNS=$(basename $0)"|NOTES.txt|TODO.txt|update_version.sh"

# Move all files not in .gitignore to OUTPUT:
mkdir -p "$OUTPUT"
if ! git ls-files | grep -vE "($EXCLUDE_PATTERNS)" | xargs -I {} cp --parents {} "$OUTPUT"; then
  echo "Error: Failed to copy files to $OUTPUT." >&2
  exit 1
fi

# Tar and zip:
if ! tar -zcf "$OUTPUT.tar.gz" "$OUTPUT"; then
  echo "Error: Failed to create tar.gz archive." >&2
  exit 1
fi

# Display disk usage information
if ! du -sh "$OUTPUT" || ! du -sh "$OUTPUT.tar.gz"; then
  echo "Error: Failed to calculate disk usage." >&2
  exit 1
fi

echo "*** DONE"
