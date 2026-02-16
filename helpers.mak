#
# Various helper targets for deployment and debugging
# Source setuptarget.sh to use them!
#

#==============================================================================#
# Deployment targets

SSH_OPTS = -o LogLevel=ERROR

# Deploy bin to target:
.PHONY: deploy
deploy: build
ifdef TARGET_IP
	@sshpass -p $(TARGET_PWD) scp $(SSH_OPTS) -P $(TARGET_SSH_PORT) $(PROGS) $(TARGET_USR)@$(TARGET_IP):$(TARGET_DIR)
else
	$(error Please source setuptarget.sh first)
endif

# Deploy web:
.PHONY: deployweb
deployweb: web
ifdef TARGET_IP
	@sshpass -p $(TARGET_PWD) ssh $(SSH_OPTS) -p $(TARGET_SSH_PORT) $(TARGET_USR)@$(TARGET_IP) 'rm -rf $(TARGET_DIR)/html/*'
	@sshpass -p $(TARGET_PWD) scp $(SSH_OPTS) -P $(TARGET_SSH_PORT) -r ./html/* $(TARGET_USR)@$(TARGET_IP):$(TARGET_DIR)/html
else
	$(error Please source setuptarget.sh first)
endif

# Deploy shell profile to target:
.PHONY: deployprofile
deployprofile:
ifdef TARGET_IP
	@sshpass -p $(TARGET_PWD) scp $(SSH_OPTS) -P $(TARGET_SSH_PORT) ./scripts/profile $(TARGET_USR)@$(TARGET_IP):/$(TARGET_USR)/.profile
	@sshpass -p $(TARGET_PWD) ssh $(SSH_OPTS) -p $(TARGET_SSH_PORT) -t $(TARGET_USR)@$(TARGET_IP) 'sed -i "s/xxxxxx/$(PROGS)/g" /$(TARGET_USR)/.profile'
else
	$(error Please source setuptarget.sh first)
endif

# Deploy gdbserver to target:
.PHONY: deploygdb
deploygdb:
ifdef TARGET_IP
	@sshpass -p $(TARGET_PWD) scp $(SSH_OPTS) -P $(TARGET_SSH_PORT) ./gdb/gdbserver $(TARGET_USR)@$(TARGET_IP):/tmp/gdbserver
else
	$(error Please source setuptarget.sh first)
endif

#==============================================================================#
# Miscellaneous targets

# Logon to ACAP dir:
.PHONY: logon
logon:
ifdef TARGET_IP
	@sshpass -p $(TARGET_PWD) ssh $(SSH_OPTS) -p $(TARGET_SSH_PORT) -t $(TARGET_USR)@$(TARGET_IP) "cd $(TARGET_DIR) && sh"
else
	$(error Please source setuptarget.sh first)
endif

# Kill the app:
.PHONY: kill
kill:
ifdef TARGET_IP
	@sshpass -p $(TARGET_PWD) ssh $(SSH_OPTS) -p $(TARGET_SSH_PORT) $(TARGET_USR)@$(TARGET_IP) 'kill -KILL $$(pidof $(PROGS))'
else
	$(error Please source setuptarget.sh first)
endif

# Check target embedded SDK info:
.PHONY: checksdk
checksdk:
ifdef TARGET_IP
	@curl --anyauth --noproxy "*" -u $(TARGET_USR):$(TARGET_PWD) \
	'$(TARGET_IP)/axis-cgi/admin/param.cgi?action=list&group=Properties.EmbeddedDevelopment'
else
	$(error Please source setuptarget.sh first)
endif

# Open apps web (Linux):
.PHONY: openweb
openweb:
ifdef TARGET_IP
	@xdg-open http://$(TARGET_IP):$(TARGET_PORT)/camera/index.html#/apps > /dev/null 2>&1
else
	$(error Please source setuptarget.sh first)
endif

# Trace logs on target:
.PHONY: log
log:
ifdef TARGET_IP
	@./scripts/log.py
else
	$(error Please source setuptarget.sh first)
endif

# Build ACAP release for all arch and put in a build dir:
.PHONY: release
release:
	@./scripts/make_acap_release.sh

# Extract ACAP SDK from Docker image (needs to be run as root):
.PHONY: getsdk
getsdk: checkdocker
	@./scripts/dockercopy.sh -i $(DOCKER_X64_IMG) -f /opt/axis/acapsdk

#==============================================================================#
# Docker helpers

# Remove all stopped containers (not images):
.PHONY: dockerprune
dockerprune: checkdocker
	@docker container prune

# List all Docker images:
.PHONY: dockerlist
dockerlist: checkdocker
	@docker image list $(DOCKER_X32_IMG)
	@echo
	@docker image list $(DOCKER_X64_IMG)

# Run ARM64 Docker image:
.PHONY: dockerrun
dockerrun: checkdocker
	@$(DOCKER_CMD) $(DOCKER_X64_IMG)

#==============================================================================#
# Code helpers

# Static code analysis using cppcheck:
.PHONY: cppcheck
cppcheck:
	@$(ECHO) "${PURPLE}*** Static code analysis${NC}"
	@cppcheck $(shell find . -name "*.[ch]") \
		--verbose --enable=all -DDEBUG=1 \
		--suppress=missingIncludeSystem \
		--suppress=unknownMacro \
		--suppress=unusedFunction

# Format code using clang-format:
.PHONY: indent
indent:
	@$(ECHO) "${PURPLE}*** Formatting code${NC}"
	@clang-format $(shell find . -name "*.[ch]") \
		-style=file -i -fallback-style=none

#==============================================================================#
# Build for host PC (requires all dependencies installed):

.PHONY: host
host: clean
	@$(MAKE) \
	  OECORE_SDK_VERSION=host \
	  APPTYPE=host \
	  $(PROGS)

#==============================================================================#
# NOTE: Build for legacy 32-bit products for testing (not release):

# Create Docker image to build 32-bit app in:
.PHONY: dockersetup32
dockersetup32: checkdocker
	@docker build -f docker/Dockerfile.armv7hf ./docker -t $(DOCKER_X32_IMG)

# Build ACAP for ARM32 using Docker:
.PHONY: acap32
acap32: checkdocker
	@$(DOCKER_CMD) $(DOCKER_X32_IMG) ./docker/build.sh $(BUILD_WEB) $(PROGS) $(ACAP_NAME) $(FINAL)

# Fast build 32-bit app (only binary file) using Docker:
.PHONY: build32
build32: checkdocker
	@$(DOCKER_CMD) $(DOCKER_X32_IMG) ./docker/build.sh 0 $(PROGS) $(ACAP_NAME) $(FINAL)

# Fast target to setup Docker image and build the 32-bit ACAP:
.PHONY: app32
app32: dockersetup32 acap32

# Install 32-bit ACAP using Docker:
.PHONY: install32
install32: checkdocker acap32
	@$(DOCKER_CMD) $(DOCKER_X32_IMG) ./docker/eap-install.sh

# Run ARM32 Docker image:
.PHONY: dockerrun32
dockerrun32: checkdocker
	@$(DOCKER_CMD) $(DOCKER_X32_IMG)

#==============================================================================#
