#!/usr/bin/env bash
# Create a TCP proxy (HTTP by default) to a local device using socat
set -e

# Default configuration:
DEFAULT_REMOTE_PORT=80  # Default target port (HTTP)
DEFAULT_LOCAL_PORT=8000 # Default local proxy port

command -v socat >/dev/null 2>&1 || {
  echo >&2 "Error: socat not installed."
  exit 1
}

if [[ "$1" == "-h" || "$1" == "--help" || $# -lt 1 ]]; then
  echo "Usage: $0 <IP> [REMOTE_PORT] [LOCAL_PORT]"
  echo
  echo "Examples:"
  echo "  $0 192.168.0.50           # HTTP proxy (80 to 8000)"
  echo "  $0 192.168.0.50 22        # SSH proxy (22 to 2122)"
  echo "  $0 192.168.0.50 22 2222   # Custom proxy"
  echo
  echo "Default remote port: $DEFAULT_REMOTE_PORT"
  echo "Default local port:  $DEFAULT_LOCAL_PORT"
  exit 0
fi

IP="$1"
REMOTE_PORT="${2:-$DEFAULT_REMOTE_PORT}"

# Auto-adjust default local port based on common protocols:
case "$REMOTE_PORT" in
22) LOCAL_PORT="${3:-2122}" ;; # SSH default
80) LOCAL_PORT="${3:-8000}" ;; # HTTP default
*) LOCAL_PORT="${3:-$DEFAULT_LOCAL_PORT}" ;;
esac

HOST=$(hostname)

# Basic IPv4 validation:
re='^(([0-9]{1,2}|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]{1,2}|1[0-9]{2}|2[0-4][0-9]|25[0-5])$'
if ! [[ "$IP" =~ $re ]]; then
  echo "Error: Invalid IP address '$IP'"
  exit 1
fi

echo
echo "*** Forwarding: $IP:$REMOTE_PORT to 127.0.0.1:$LOCAL_PORT"
echo "*** Access locally via:"

if [[ "$REMOTE_PORT" -eq 80 ]]; then
  echo "    http://$HOST:$LOCAL_PORT"
elif [[ "$REMOTE_PORT" -eq 22 ]]; then
  echo "    ssh root@$HOST -p $LOCAL_PORT"
else
  echo "    tcp://$HOST:$LOCAL_PORT"
fi

echo
echo "Press Ctrl+C to stop."
echo

trap "echo; echo 'Proxy stopped.'; exit 0" SIGINT

socat tcp-listen:"$LOCAL_PORT",reuseaddr,fork tcp:"$IP:$REMOTE_PORT"
