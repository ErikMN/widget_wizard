#!/bin/bash

echo "*** Build web"
yarn --cwd web build

CREDENTIALS="credentials2.json"

ROOT=$(pwd)

# The remote host:
REMOTE=$(jq -r .remote "$CREDENTIALS")

# Remote root dir:
REMOTE_ROOT=$(jq -r .remoteRoot "$CREDENTIALS")

# The remote install dir:
REMOTE_DIR="$REMOTE:$REMOTE_ROOT/app"

LOCAL_BUILD_FILES="$ROOT/web/build/"

echo "*** Clean remote"
ssh -t "$REMOTE" "rm -rf app/*"

# Sync files
echo "*** Sync files"
rsync -r --progress "$LOCAL_BUILD_FILES" "$REMOTE_DIR"
