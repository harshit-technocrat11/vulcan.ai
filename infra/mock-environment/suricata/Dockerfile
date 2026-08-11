FROM debian:bookworm-slim

# Network IDS. Runs in the Docker engine's network namespace (host networking)
# so it can capture the mocknet bridge interface and inspect all traffic
# between the attacker and the targets.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        suricata \
        suricata-update \
        iproute2 \
        python3 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Fetch the ET Open ruleset at build time (skipped gracefully when offline).
RUN suricata-update || true

# Append lab-local detection rules so the demos work even without ET rules.
COPY config/local.rules /etc/suricata/local.rules
RUN cat /etc/suricata/local.rules >> /var/lib/suricata/rules/suricata.rules

COPY scripts/detect-bridge.py /usr/local/bin/detect-bridge.py
COPY scripts/eve-forwarder.py /usr/local/bin/eve-forwarder.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
