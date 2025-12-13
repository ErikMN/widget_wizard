#!/bin/bash
#
# Update the version number of the ACAP
# Version must be on format major.minor.micro
#
# Files updated: package.conf manifest.json web/package.json
#
set -e

# Check for uncommitted changes:
if ! git diff-index --quiet HEAD --; then
  echo "There are uncommitted changes. Please commit them before running this script."
  exit 1
fi

# Get current tag, start with 0.0.1 if no tags are found:
CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "0.0.1")

# Validate and parse input version argument:
if [[ "$#" -ne 1 ]]; then
  echo "Usage: $0 <version_number>"
  echo "Current version: $CURRENT_TAG"
  exit 1
fi

APP_VERSION="$1"

# Check if APP_VERSION is in the format x.y.z
if [[ ! "$APP_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid version format. Should be: major.minor.micro"
  exit 1
fi

# Fail early if tag already exists:
if git rev-parse "$APP_VERSION" >/dev/null 2>&1; then
  echo "Tag $APP_VERSION already exists. Aborting."
  exit 1
fi

echo "Do you want to upgrade version to $APP_VERSION from $CURRENT_TAG? (y/n)"
read -r response

if [[ "$response" != "y" ]]; then
  echo "Upgrade aborted. Exiting script."
  exit 0
fi

# Go to project root dir:
script_dir="$(cd "$(dirname "$0")" && pwd)"
parent_dir="$(cd "$script_dir/.." && pwd)"
cd "$parent_dir" || {
  echo "*** Failed to enter project root dir"
  exit 1
}

# Check that required files exist before modifying anything:
for file in package.conf manifest.json web/package.json; do
  if [ ! -f "$file" ]; then
    echo "*** Required file '$file' not found. Aborting."
    exit 1
  fi
done

# Detect sed -i flavor (GNU vs BSD):
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

echo "*** Set app version: $APP_VERSION"

# Update package.conf:
"${SED_INPLACE[@]}" "s/APPMAJORVERSION=\"[0-9]*\"/APPMAJORVERSION=\"${APP_VERSION%%.*}\"/" package.conf
"${SED_INPLACE[@]}" "s/APPMINORVERSION=\"[0-9]*\"/APPMINORVERSION=\"$(echo "$APP_VERSION" | cut -d. -f2)\"/" package.conf
"${SED_INPLACE[@]}" "s/APPMICROVERSION=\"[0-9]*\"/APPMICROVERSION=\"$(echo "$APP_VERSION" | cut -d. -f3)\"/" package.conf

# Update manifest.json:
"${SED_INPLACE[@]}" "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"${APP_VERSION}\"/" manifest.json

# Update web/package.json:
"${SED_INPLACE[@]}" "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"${APP_VERSION}\"/" web/package.json

echo "*** Version updated to $APP_VERSION from $CURRENT_TAG"

echo "Do you want to push tag $APP_VERSION to the remote repository? (y/n)"
read -r push_response

if [[ "$push_response" != "y" ]]; then
  echo "Tag push aborted. Exiting script."
  exit 0
fi

# Create and push tags:
echo "*** Push tag $APP_VERSION"
git add package.conf manifest.json web/package.json || {
  echo "*** Failed to add files related to version"
  exit 1
}
git commit -m "Bump version to $APP_VERSION from $CURRENT_TAG" || {
  echo "*** Failed to commit version updated files"
  exit 1
}
git tag -a "$APP_VERSION" -m "$APP_VERSION" || {
  echo "*** Failed to tag $APP_VERSION"
  exit 1
}
git push && git push --tags || {
  echo "*** Failed to push tag $APP_VERSION"
  exit 1
}

# Exit with success:
echo "*** Successfully pushed tag $APP_VERSION"
exit 0
