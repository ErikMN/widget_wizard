##################### ACAP SDK aarch64 image ###################################
ARG ARCH=aarch64
ARG REPO=axisecp

# ACAP 4: https://hub.docker.com/r/axisecp/acap-native-sdk
ARG VERSION=1.11
ARG UBUNTU_VERSION=22.04
ARG SDK=acap-native-sdk

FROM ${REPO}/${SDK}:${VERSION}-${ARCH}-ubuntu${UBUNTU_VERSION}

##################### General setup ############################################

# Install some utils:
RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update && apt-get install -y -f --no-install-recommends \
  jq gnupg ripgrep python3-pip git pkgconf ninja-build cmake

# Install Node.js:
ARG NODE_MAJOR=20
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update && apt-get install -y -f --no-install-recommends \
  nodejs

# Configure npm and install yarn:
RUN npm install --global yarn

# Clean APT cache and lists:
RUN DEBIAN_FRONTEND=noninteractive \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

# ACAP SDK install path:
ARG ACAP_SDK_INSTALL_DIR=/opt/axis/acapsdk/sysroots/aarch64/usr

# Install libs here:
ARG INC_DIR=${ACAP_SDK_INSTALL_DIR}/include
