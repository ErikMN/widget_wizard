#!/bin/bash
set -e

FMT_BLUE=$(printf '\033[34m')
FMT_YELLOW=$(printf '\033[33m')
FMT_RED=$(printf '\033[31m')
FMT_RESET=$(printf '\033[0m')

N_THREADS="$(nproc)"

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <BUILD_WEB> <PROGS> <ACAP_NAME> [FINAL]"
  exit 1
fi

BUILD_WEB=$1
PROGS=$2
ACAP_NAME=$3
FINAL=${4:-n}

# Source the SDK:
. /opt/axis/acapsdk/environment-setup*

# Verify SDK environment variables are set:
if [ -z "${OECORE_TARGET_ARCH:-}" ]; then
  echo -e "${FMT_RED}Error: OECORE_TARGET_ARCH is not set after sourcing ACAP SDK environment.${FMT_RESET}"
  exit 1
fi
if [ -z "${OECORE_SDK_VERSION:-}" ]; then
  echo -e "${FMT_RED}Error: OECORE_SDK_VERSION is not set after sourcing ACAP SDK environment.${FMT_RESET}"
  exit 1
fi

echo
echo -e "${FMT_BLUE}>>> BUILDING FOR $OECORE_TARGET_ARCH using ACAPSDK $OECORE_SDK_VERSION${FMT_RESET}"
if [ "$FINAL" = "y" ]; then
  echo -e "${FMT_YELLOW}*** RELEASE VERSION ***${FMT_RESET}"
else
  echo -e "${FMT_YELLOW}*** DEBUG VERSION ***${FMT_RESET}"
fi
echo

# Translate OECORE_TARGET_ARCH to packaging architecture:
case "${OECORE_TARGET_ARCH}" in
aarch64)
  TARGET_ARCH="aarch64"
  ;;
arm)
  # 32-bit ACAP SDK reports "arm" but packaging requires "armv7hf":
  TARGET_ARCH="armv7hf"
  ;;
*)
  echo -e "${FMT_RED}Error: Unsupported OECORE_TARGET_ARCH: ${OECORE_TARGET_ARCH}${FMT_RESET}"
  exit 1
  ;;
esac

# Set APPTYPE/architecture from translated arch:
sed -i "s/APPTYPE=\"[^\"]*\"/APPTYPE=\"${TARGET_ARCH}\"/" package.conf
sed -i "s/\"architecture\": \"[^\"]*\"/\"architecture\": \"${TARGET_ARCH}\"/" manifest.json
# Set PACKAGENAME/friendlyName:
sed -i "s/PACKAGENAME=\"[^\"]*\"/PACKAGENAME=\"${ACAP_NAME}\"/" package.conf
sed -i "s/\"friendlyName\": \"[^\"]*\"/\"friendlyName\": \"${ACAP_NAME}\"/" manifest.json
# Set APPNAME/appName:
sed -i "s/APPNAME=\"[^\"]*\"/APPNAME=\"${PROGS}\"/" package.conf
sed -i "s/\"appName\": \"[^\"]*\"/\"appName\": \"${PROGS}\"/" manifest.json

if [ "$BUILD_WEB" = "1" ] || [ "$BUILD_WEB" = "y" ]; then
  # Build full ACAP with web:
  make clean && FINAL=$FINAL make -j"$N_THREADS" && make web && eap-create.sh
else
  # Build app only:
  make clean && FINAL=$FINAL make -j"$N_THREADS"
fi
