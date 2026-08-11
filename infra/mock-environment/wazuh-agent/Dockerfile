FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Base system packages. rsyslog is required so sshd's auth logs land in
# /var/log/auth.log, which is what the Wazuh agent monitors.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        ca-certificates \
        openssh-server \
        rsyslog \
        sudo \
        iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install the Wazuh agent from the official repository.
RUN curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH \
        | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import \
    && chmod 644 /usr/share/keyrings/wazuh.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" \
        > /etc/apt/sources.list.d/wazuh.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends wazuh-agent \
    && rm -rf /var/lib/apt/lists/*

# Intentionally weak credentials so the SSH brute-force demo works.
RUN useradd -m -s /bin/bash victim \
    && echo 'victim:victim' | chpasswd \
    && mkdir -p /run/sshd

COPY config/sshd_config /etc/ssh/sshd_config
COPY config/ossec.conf /var/ossec/etc/ossec.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22 1514 1515

ENTRYPOINT ["/entrypoint.sh"]
