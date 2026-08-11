#!/usr/bin/env python3
"""Read eve.json lines from stdin and POST alert events to the Ingestion service.

Suricata does not natively send webhooks; this forwarder is the bridge between
eve.json and Sentinel's webhook endpoint.
"""
import json
import os
import sys
import time
import urllib.request

INGEST_URL = os.environ.get(
    "INGEST_URL", "http://host.docker.internal:8080/webhooks/suricata"
)
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")


def post(event: dict) -> None:
    if event.get("event_type") != "alert":
        return

    body = json.dumps(event).encode("utf-8")
    req = urllib.request.Request(INGEST_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    if INGEST_TOKEN:
        req.add_header("X-Ingest-Token", INGEST_TOKEN)

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp.read()
        alert = event.get("alert", {})
        sys.stderr.write(
            f"[forwarder] posted alert sid={alert.get('signature_id')} "
            f"{alert.get('signature', '')}\n"
        )
    except Exception as exc:  # noqa: BLE001 - keep the tail loop alive
        sys.stderr.write(f"[forwarder] post failed: {exc}\n")
        time.sleep(1)


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        post(event)


if __name__ == "__main__":
    main()
