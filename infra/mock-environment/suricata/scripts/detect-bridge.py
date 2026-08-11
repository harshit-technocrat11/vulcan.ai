#!/usr/bin/env python3
"""Find the bridge interface whose IPv4 address belongs to MONITOR_SUBNET.

Suricata runs in the Docker engine network namespace (host networking); the
bridge backing the "mocknet" docker network is the interface whose traffic we
need to capture to see attacker <-> target traffic.
"""
import ipaddress
import re
import subprocess
import sys


def main() -> int:
    subnet_arg = sys.argv[1] if len(sys.argv) > 1 else "172.20.0.0/24"
    subnet = ipaddress.ip_network(subnet_arg, strict=False)

    out = subprocess.check_output(["ip", "-o", "-4", "addr", "show"]).decode()
    pattern = re.compile(r"^\d+:\s+(\S+).*inet\s+(\S+)", re.MULTILINE)

    for iface, addr in pattern.findall(out):
        try:
            ip = ipaddress.ip_address(addr.split("/")[0])
        except ValueError:
            continue
        if ip in subnet:
            print(iface)
            return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
