#!/bin/bash -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Source the SDK:
. /opt/axis/acapsdk/environment-setup*

echo -e "${GREEN}>>> Installing using ACAPSDK $OECORE_SDK_VERSION for $OECORE_TARGET_ARCH${NC}"

# NOTE: Make sure SDK eap-install.sh supports setting the HTTP port:
export axis_device_ip=$TARGET_IP:$TARGET_PORT
export password=$TARGET_PWD

# Try to enable unsigned app mode on target:
if ! curl --fail --silent --show-error --anyauth --noproxy "*" -u "${TARGET_USR}:${TARGET_PWD}" \
  "http://${TARGET_IP}:${TARGET_PORT}/axis-cgi/applications/config.cgi?action=set&name=AllowUnsigned&value=true" >/dev/null; then
  echo -e "${YELLOW}>>> Failed to enable unsigned mode${NC}"
else
  echo -e "${GREEN}>>> Unsigned mode enabled${NC}"
fi
echo

eap-install.sh
