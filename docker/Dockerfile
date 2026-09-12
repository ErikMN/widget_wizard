##################### Overridable arguments ####################################
ARG ARCH=aarch64
ARG REPO=docker.io/axisecp

# ACAP 4: https://hub.docker.com/r/axisecp/acap-native-sdk
ARG SDK_VERSION=12.11.0
ARG UBUNTU_VERSION=24.04
ARG SDK=acap-native-sdk
ARG LWS_VER=v4.5-stable
ARG LWS_SHA256=8a7017656055c2d7416e8a68535395e240ba5e309a35c219cb705bd701e01a23


##################### ACAP SDK aarch64 image ###################################
FROM $REPO/$SDK:$SDK_VERSION-aarch64-ubuntu$UBUNTU_VERSION AS builder-aarch64

##################### ACAP SDK armv7hf image ###################################
FROM $REPO/$SDK:$SDK_VERSION-armv7hf-ubuntu$UBUNTU_VERSION AS builder-armv7hf
ARG EXTRA_WS_ARGS='-D ENABLE_NEON=ON -D ENABLE_VFPV3=ON'

##################### ACAP SDK image ###########################################
FROM builder-$ARCH
ARG ARCH
ARG LWS_VER
ARG LWS_SHA256
ARG EXTRA_WS_ARGS
##################### General setup ############################################

# Install some utils:
RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update && apt-get install -y -f --no-install-recommends \
  jq gnupg ripgrep cmake

# Install Node.js:
ARG NODE_MAJOR=22
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
ARG ACAP_SDK_INSTALL_DIR=/opt/axis/acapsdk/sysroots/$ARCH/usr

# Install libs here:
ARG INC_DIR=${ACAP_SDK_INSTALL_DIR}/include

##################### Setup and build libwebsockets ############################

# libwebsockets paths and version:
ARG BUILD_DIR=/opt/build
ARG LWS_SRC_DIR=${BUILD_DIR}/LWS
ARG LWS_BUILD_DIR=${LWS_SRC_DIR}/build

# Download and verify libwebsockets to LWS_SRC_DIR:
WORKDIR "$LWS_SRC_DIR"
RUN curl -fsSLo /tmp/libwebsockets.tar.gz "https://github.com/warmcat/libwebsockets/archive/refs/heads/$LWS_VER.tar.gz" && \
    echo "$LWS_SHA256  /tmp/libwebsockets.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/libwebsockets.tar.gz --strip-components=1 && \
    rm /tmp/libwebsockets.tar.gz

# Configure and build libwebsockets statically:
WORKDIR ${LWS_BUILD_DIR}
RUN . /opt/axis/acapsdk/environment-setup* && \
  cmake \
  -D CMAKE_INSTALL_PREFIX=${ACAP_SDK_INSTALL_DIR} \
  -D CMAKE_CXX_COMPILER=${CXX%-g++*}-g++ \
  -D CMAKE_CXX_FLAGS="${CXX#*-g++}" \
  -D CMAKE_C_COMPILER=${CC%-gcc*}-gcc \
  -D CMAKE_C_FLAGS="${CC#*-gcc}" \
  -D CMAKE_BUILD_TYPE=RELEASE \
  -D CPU_BASELINE=NEON,VFPV3 \
  -D LWS_WITH_SSL=OFF \
  -D LWS_WITH_CRYPTO=OFF \
  -D LWS_WITH_ZLIB=OFF \
  -D LWS_WITH_STATIC=ON \
  -D LWS_WITH_SHARED=OFF \
  -D LWS_WITHOUT_TESTAPPS=ON \
  -D LWS_HAVE_LIBCAP=OFF \
  -D LWS_WITH_LIBCAP=OFF \
  $EXTRA_WS_ARGS \
  "$LWS_SRC_DIR" && \
  make -j"$(nproc)" install

# Copy static libwebsockets archive for linking:
WORKDIR /opt/app/libwebsockets
RUN cp -P ${ACAP_SDK_INSTALL_DIR}/lib/libwebsockets.a .

################################################################################


##################### PATCHES ##################################################


##################### Patch eap-install.sh #####################################
# Patch eap-install.sh to support host and port in TARGET_IP variable

COPY patches/eap-install-host-port.patch /tmp/

RUN patch -N \
  /opt/axis/acapsdk/sysroots/x86_64-pokysdk-linux/usr/bin/eap-install.sh \
  /tmp/eap-install-host-port.patch

################################################################################
