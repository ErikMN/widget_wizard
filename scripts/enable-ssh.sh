#!/usr/bin/env bash
# Enable SSH on target device

set -eu

[ -z "$TARGET_IP" ] && echo 'set TARGET_IP' 1>&2 && exit 1

if ! which sshpass >/dev/null; then
  echo 'sshpass not found' 1>&2
  exit 1
fi

SSHARGS="-o StrictHostKeyChecking=no \
         -o UserKnownHostsFile=/dev/null \
         -o VerifyHostKeyDNS=no \
         -o ForwardX11=no \
         -o LogLevel=ERROR \
         -o GSSAPIAuthentication=no \
         -o GSSAPIKeyExchange=no \
         -o GSSAPITrustDns=no \
         -o ServerAliveInterval=5"

wget --no-proxy -O - "http://root:pass@$TARGET_IP/axis-cgi/admin/param.cgi?action=update&Network.SSH.Enabled=yes"

sshpass -p pass ssh-copy-id "$SSHARGS" -o ControlPath=none root@"$TARGET_IP" || {
  sleep 3
  sshpass -p pass ssh-copy-id "$SSHARGS" -o ControlPath=none root@"$TARGET_IP"
}
