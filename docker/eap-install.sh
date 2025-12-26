#!/bin/bash -e

GREEN='\033[0;32m'
NC='\033[0m'

# Source the SDK:
. /opt/axis/acapsdk/environment-setup*

echo
echo -e "${GREEN}>>> Installing using ACAPSDK $OECORE_SDK_VERSION for $OECORE_TARGET_ARCH${NC}"
echo

# NOTE: Make sure SDK eap-install.sh supports setting the HTTP port:
export axis_device_ip=$TARGET_IP:$TARGET_PORT
export password=$TARGET_PWD

eap-install.sh
