# Print colors:
RED=\033[0;31m
LIGHT_RED=\033[1;31m
GREEN=\033[0;32m
BLUE=\033[0;34m
PURPLE=\033[0;35m
CYAN=\033[0;36m
YELLOW=\033[1;33m
NC=\033[0m # No color

SHELL := $(shell which sh)

PROGS = widget_wizard
ACAP_NAME = "Widget Wizard"
LDLIBS = -lm

DOCKER_X64_IMG := widget_wizard_img_aarch64
APPTYPE := $(shell grep "^APPTYPE=" package.conf | cut -d "=" -f 2 | sed 's/"//g')
DOCKER := $(shell command -v docker 2> /dev/null)
NODE := $(shell command -v node 2> /dev/null)
YARN := $(shell command -v yarn 2> /dev/null)
ECHO := echo -e
BUILD_WEB = 1

# Helper targers:
include helpers.mak

TARGET_DIR = /usr/local/packages/$(PROGS)/

d := $(CURDIR)
$(shell touch $(d)/.yarnrc)

# Run Docker cmd with provided image:
DOCKER_CMD := docker run --rm -i -t \
              -e TARGET_IP=$(TARGET_IP) \
              -e TARGET_USR=$(TARGET_USR) \
              -e TARGET_PWD=$(TARGET_PWD) \
              -e HOME=$(d) \
              -w $(d) \
              -u $(shell id -u):$(shell id -g) \
              -v $(d):$(d) \
              -v /etc/passwd:/etc/passwd:ro \
              -v /etc/group:/etc/group:ro \
              -v $(d)/.yarnrc:$(d)/.yarnrc

LDFLAGS = -L./libwebsockets -Wl,--no-as-needed,-rpath,'$$ORIGIN/libwebsockets'

PKGS += glib-2.0 gio-2.0 jansson libwebsockets
ifdef PKGS
  LDLIBS += $(shell pkg-config --libs $(PKGS))
  CFLAGS += $(shell pkg-config --cflags $(PKGS))
endif

SRCS = $(wildcard src/*.c)
OBJS = $(SRCS:.c=.o)
CFLAGS += -DAPP_NAME="\"$(PROGS)\""
CFLAGS += -Werror
CFLAGS += -W
CFLAGS += -Wextra
# CFLAGS += -Wpedantic
# CFLAGS += -Wmissing-prototypes
# CFLAGS += -Wstrict-prototypes
CFLAGS += -Wvla
CFLAGS += -Wformat=2
CFLAGS += -Wmaybe-uninitialized
CFLAGS += -Wunused-parameter
CFLAGS += -Wunused-but-set-parameter
CFLAGS += -Wpointer-arith
CFLAGS += -Wbad-function-cast
CFLAGS += -Wfloat-equal
CFLAGS += -Winline
CFLAGS += -Wdisabled-optimization

# Set default value for FINAL to 'y' if not already defined:
FINAL ?= y
# ASAN=y
ifeq ($(FINAL), y)
  LDFLAGS += -s
  CFLAGS += -DNDEBUG -g0 -O2
else
  CFLAGS += -g3 -DDEBUG
  ifeq ($(ASAN), y)
    CFLAGS += -fsanitize=address -O1 -fno-omit-frame-pointer
    LDLIBS += -fsanitize=address
  endif
endif

# Default target:
.DEFAULT_GOAL := all
.PHONY: all $(PROGS)
all: $(PROGS)

# Print help:
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  dockersetup    : Create the Docker image $(DOCKER_X64_IMG)"
	@echo "  dockerlist     : List all Docker images"
	@echo "  dockerrun      : Log in to the Docker image for current arch"
	@echo "  acap           : Build for 64-bit ARM in Docker"
	@echo "  build          : Fast build ACAP binary for current arch"
	@echo "  install        : Install the ACAP to target device"
	@echo "  deploy         : Deploy the ACAP binary to target device (requires ACAP already installed)"
	@echo "  deployprofile  : Deploy shell profile to target device"
	@echo "  deploygdb      : Deploy gdbserver to target device"
	@echo "  checksdk       : Check SDK information for target device"
	@echo "  logon          : Logon to ACAP dir"
	@echo "  log            : Trace logs on target"
	@echo "  kill           : Kill ACAP running on target device"
	@echo "  openweb        : Open ACAP web on target device"
	@echo "  web            : Build the web using Node.js and Yarn"
	@echo "  deployweb      : Deploy the web to target device"
	@echo "  release        : Build ACAP release for all arch and put in a release dir"
	@echo "  clean          : Clean the build"
	@echo "  distclean      : Clean everything, web and *.old *.orig"

# Print flags:
.PHONY: flags
flags:
	@echo "*** Debug info"
	@echo "ACAP_NAME: $(ACAP_NAME)"
	@echo "PROGS: $(PROGS)"
	@echo "Compiler: $(CC)"
	@echo "C Source-files: $(SRCS)"
	@echo "Object-files: $(OBJS)"
	@echo "Compiler-flags: $(CFLAGS)"
	@echo "Linker-flags: $(LDFLAGS)"
	@echo "Linker-libs: $(LDLIBS)"
	@echo "User ID: $(shell id -u)"
	@echo "Group ID: $(shell id -g)"
	@echo "Target IP: $(TARGET_IP)"
	@echo "APPTYPE: $(APPTYPE)"

# Build the app (if SDK is sourced):
ifdef OECORE_SDK_VERSION
$(PROGS): $(OBJS)
	@$(ECHO) "${GREEN}*** Build $(PROGS)${NC}"
	$(CC) $(LDFLAGS) $^ $(LDLIBS) -o $@
else
$(PROGS):
	$(error Please build "$@" from Docker, run 'make help')
endif

# Build web:
.PHONY: web
web:
ifndef NODE
	$(error "Node.js is not installed")
endif
ifndef YARN
	$(error "Yarn is not installed")
endif
	@cd web && yarn && yarn build
	@$(RM) -r html
	@cp -R web/build html

# Check that Docker is installed:
.PHONY: checkdocker
checkdocker:
ifndef DOCKER
	$(error Please install Docker first!)
endif

# Create Docker image(s) to build in:
.PHONY: dockersetup
dockersetup: checkdocker
	@docker build -f docker/Dockerfile ./docker -t $(DOCKER_X64_IMG)

# Build ACAP for ARM64 using Docker:
.PHONY: acap
acap: checkdocker
	@./scripts/copylib.sh $(DOCKER_X64_IMG) libwebsockets
	@$(DOCKER_CMD) $(DOCKER_X64_IMG) ./docker/build_aarch64.sh $(BUILD_WEB) $(PROGS) $(ACAP_NAME) $(FINAL)

# Fast build (only binary file) using Docker:
.PHONY: build
build: checkdocker
ifeq ($(APPTYPE), aarch64)
	@$(DOCKER_CMD) $(DOCKER_X64_IMG) ./docker/build.sh $(FINAL)
else
	@echo "Error: Unsupported APPTYPE"
	@exit 1
endif

# Install ACAP using Docker:
.PHONY: install
install: checkdocker acap
ifeq ($(APPTYPE), aarch64)
	@$(DOCKER_CMD) $(DOCKER_X64_IMG) ./docker/eap-install.sh
else
	@echo "Error: Unsupported APPTYPE"
	@exit 1
endif

# Cleanup:
.PHONY: clean
clean:
	@$(ECHO) "${RED}*** Clean build${NC}"
	$(RM) $(PROGS) $(OBJS) *.eap *LICENSE.txt

# Cleanup everything:
.PHONY: distclean
distclean: clean
	$(RM) -r html .*var_log_messages* *.old *.orig tmp* release* libwebsockets

# Clean node modules:
.PHONY: webclean
webclean:
	$(RM) -r web/node_modules

# Really clean up everything:
.PHONY: superclean
superclean: distclean
	@git clean -fdX
