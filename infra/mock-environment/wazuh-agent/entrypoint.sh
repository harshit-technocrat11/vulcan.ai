#!/usr/bin/env bash
set -euo pipefail

MANAGER_HOST="${WAZUH_MANAGER_HOST:-wazuh-manager}"
AGENT_NAME="${WAZUH_AGENT_NAME:-sentinel-ssh-target}"

echo "[wazuh-agent] resolving manager ${MANAGER_HOST}"
MANAGER_IP="$(getent hosts "${MANAGER_HOST}" | awk '{print $1; exit}')"
if [ -z "${MANAGER_IP}" ]; then
  echo "[wazuh-agent] ERROR: cannot resolve ${MANAGER_HOST}" >&2
  exit 1
fi
echo "[wazuh-agent] manager ip: ${MANAGER_IP}"

# Point the agent at the resolved manager address.
sed -i "s#<address>.*</address>#<address>${MANAGER_IP}</address>#" /var/ossec/etc/ossec.conf

# Logging so sshd auth events reach /var/log/auth.log for the agent to monitor.
rsyslogd
ssh-keygen -A
/usr/sbin/sshd
echo "[wazuh-agent] sshd and rsyslog started"

# Register with the manager (idempotent, with retries while the manager boots).
if [ ! -f /var/ossec/etc/client.keys ]; then
  echo "[wazuh-agent] registering as '${AGENT_NAME}'"
  for attempt in $(seq 1 30); do
    if /var/ossec/bin/agent-auth -m "${MANAGER_IP}" -p 1515 -A "${AGENT_NAME}" 2>/dev/null; then
      echo "[wazuh-agent] registration OK"
      break
    fi
    echo "[wazuh-agent] manager not ready, retrying (${attempt}/30)..."
    sleep 5
  done
fi

# Start the agent in the foreground.
exec /var/ossec/bin/wazuh-agentd -f -F
