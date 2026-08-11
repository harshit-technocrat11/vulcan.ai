#!/usr/bin/env bash
set -euo pipefail

: "${MONITOR_SUBNET:=172.20.0.0/24}"
: "${INGEST_URL:=http://host.docker.internal:8080/webhooks/suricata}"

echo "[suricata] detecting bridge interface for subnet ${MONITOR_SUBNET}"
IFACE="$(python3 /usr/local/bin/detect-bridge.py "${MONITOR_SUBNET}" || true)"
if [ -z "${IFACE}" ]; then
  echo "[suricata] WARNING: no bridge found for ${MONITOR_SUBNET}, falling back to eth0" >&2
  IFACE="eth0"
fi
echo "[suricata] monitoring interface: ${IFACE}"

# With host networking the embedded DNS does not resolve host.docker.internal,
# so fall back to the default gateway (the Windows host) when needed.
HOST_IP="$(getent hosts host.docker.internal | awk '{print $1; exit}')"
if [ -z "${HOST_IP}" ]; then
  HOST_IP="$(ip route | awk '/^default/ {print $3; exit}')"
  echo "[suricata] host.docker.internal not resolvable, using gateway ${HOST_IP}" >&2
fi
export INGEST_URL
INGEST_URL="$(printf '%s' "${INGEST_URL}" | sed "s#host.docker.internal#${HOST_IP}#")"
echo "[suricata] forwarding alerts to ${INGEST_URL}"

mkdir -p /var/log/suricata

# Start the IDS in the background (interface is picked up from -i).
suricata \
  -c /etc/suricata/suricata.yaml \
  -i "${IFACE}" \
  --set eve-log.enabled=yes \
  &

# Tail eve.json and push every alert event to the Ingestion service.
sleep 2
exec tail -F -n 0 /var/log/suricata/eve.json | python3 -u /usr/local/bin/eve-forwarder.py
