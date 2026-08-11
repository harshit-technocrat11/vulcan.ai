# Sentinel - Session Code Documentation

This document describes **everything added to the repository in this session**,
matching the architecture in [`../sentinel_architecture (1).md`](../sentinel_architecture%20(1).md).

Three pieces were delivered, plus a fourth data-access package:

1. **`apps/ingestion`** - a lightweight Node.js/TypeScript alert ingestion
   service (Phase 2 of the V1 plan). Publishes normalized alerts as **BullMQ**
   jobs to Redis.
2. **`apps/worker`** - background workers (architecture section 11) that
   consume those jobs: enrichment via threat-intel + alert correlation into
   incidents.
3. **`infra/mock-environment`** - a Docker lab that generates real security
   alerts (Suricata + Wazuh) and feeds them into the Ingestion service.
4. **`packages/db`** - Prisma 7 + Supabase PostgreSQL data layer (architecture
   section 13): schema, driver-adapter client, and repositories.

---

## Session changes at a glance

| Path                                  | Type       | What it is                                            |
| ------------------------------------- | ---------- | ----------------------------------------------------- |
| `apps/ingestion/`                     | new app    | Ingestion webhook service (validate -> normalize -> publish BullMQ jobs) |
| `apps/worker/`                        | new app    | Background worker: consume `alert.enrich`, enrich via threat-intel, correlate into incidents |
| `infra/mock-environment/`             | new infra  | Docker Compose lab: targets, IDS/EDR, attacker        |
| `packages/threat-intel/`              | new package| Reusable threat-intelligence abstraction (live providers, now built to `dist`) |
| `packages/db/`                        | new package| Prisma 7 + Supabase data layer: schema, prisma.config.ts, driver-adapter client, repositories |
| `turbo.json`                          | modified   | Added `globalEnv` (incl. `DATABASE_URL`/`DIRECT_URL`/`NODE_ENV`), and `dev`/`check-types` now depend on `^build` |
| `pnpm-lock.yaml`                      | modified   | Lockfile refresh from `pnpm install`                  |

---

## 1. `apps/ingestion` - Security Alert Ingestion

### 1.1 Responsibilities (from the architecture doc, section 10)

> Receive alerts from external security infrastructure -> Validate ->
> Normalize -> Publish to Redis. It must stay lightweight and perform no
> expensive AI processing.

### 1.2 File structure

```text
apps/ingestion/
├── package.json              # express, bullmq, ioredis, zod, dotenv; scripts: dev/build/start/lint/check-types
├── tsconfig.json             # extends @repo/typescript-config
├── eslint.config.js          # extends @repo/eslint-config
└── src/
    ├── main.ts               # bootstrap: RedisPublisher + Express, SIGINT/SIGTERM shutdown
    ├── config.ts             # loads global .env (root) -> config (PORT, HOST, REDIS_URL, REDIS_QUEUE, INGEST_TOKEN)
    ├── app.ts                # Express app: /health, webhook auth middleware, routers, 404/500
    ├── types/
    │   └── sentinel.ts       # SentinelAlert + SentinelObservable + SentinelHost types
    ├── validators/
    │   └── alert.validator.ts # zod schemas: wazuhAlertSchema, suricataAlertSchema
    ├── normalizer/
    │   └── normalizer.ts     # normalizeWazuh(), normalizeSuricata() -> SentinelAlert
    ├── sources/
    │   ├── process.ts        # shared pipeline: validate each item, normalize, publish
    │   ├── wazuh/handler.ts  # POST /webhooks/wazuh
    │   └── suricata/handler.ts # POST /webhooks/suricata
    └── publisher/
        └── redis.publisher.ts # BullMQ producer: Queue.add("enrich", alert) on REDIS_QUEUE
```

### 1.3 Environment variables (single global `vulcan.ai/.env`)

There is **one `.env` only, at the workspace root** (`vulcan.ai/.env`, copied
from `vulcan.ai/.env.example`). No other `.env` files exist. `src/config.ts`
loads it with `dotenv`, resolving the path relative to the file so it works
both with `tsx` (dev) and compiled output (prod).

| Variable        | Default                   | Purpose                                            |
| --------------- | ------------------------- | -------------------------------------------------- |
| `PORT`          | `8080`                    | Webhook listener port                              |
| `HOST`          | `0.0.0.0`                 | Bind all interfaces so containers can reach it     |
| `REDIS_URL`     | `redis://localhost:6379`  | Redis connection                                   |
| `REDIS_QUEUE`   | `alert.enrich`            | BullMQ queue: Ingestion publishes, Worker consumes |
| `INGEST_TOKEN`  | *(empty)*                 | Optional `X-Ingest-Token` shared secret for webhooks |
| `WORKER_CONCURRENCY` | `5`                   | Jobs the Worker processes in parallel per queue   |

> The global `.env` additionally carries `WAZUH_API_URL` / `WAZUH_API_USER` /
> `WAZUH_API_PASSWORD` (matching `docker-compose.yml`). These are **verification
> only** and are not read by the service - they are used to query the Wazuh API
> from the host.

### 1.4 HTTP endpoints

| Method | Path               | Behaviour                                                    |
| ------ | ------------------ | ------------------------------------------------------------ |
| `GET`  | `/health`          | `200` + `{"status":"ok","redis":"connected",...}` when Redis answers, else `503` + `{"status":"degraded",...}` |
| `POST` | `/webhooks/wazuh`  | Validate -> normalize -> enqueue a BullMQ `enrich` job |
| `POST` | `/webhooks/suricata` | Same pipeline for Suricata events                          |

Webhook rules:

- Accepts a single JSON object **or** an array.
- Per-item result: `{ accepted: string[] /* alert ids */, rejected: [{index, error}] }`.
- `400 {"error":"no valid alerts", result}` if every item failed validation.
- `503 {"error":"could not publish alert", message}` if the Redis publish throws.
- If `INGEST_TOKEN` is set, all `/webhooks/*` requests require the
  `X-Ingest-Token` header (401 otherwise).

### 1.5 Normalized alert format (`src/types/sentinel.ts`)

```ts
interface SentinelAlert {
  id: string;                 // "sentinel-" + sha256(source|agentId|ruleId|ts).slice(0,16)
  source: "wazuh" | "suricata";
  severity: number;           // 1..10, 10 = most severe
  title: string;
  description: string;
  timestamp: string;          // ISO 8601 of the original event
  host: { name?: string; ip?: string };
  observables: { type: string; value: string }[];  // ipv4/host/hash/port...
  raw: Record<string, unknown>;  // original payload preserved untouched
}
```

Severity mapping:

| Source    | Input                        | Mapping                                  |
| --------- | ---------------------------- | ---------------------------------------- |
| Wazuh     | `rule.level` (0..15)         | `clamp(round(level/15*10), 1..10)`       |
| Suricata  | `alert.severity` (1..4)      | `1->10, 2->8, 3->5, 4->3`, default 5     |

Observables extracted:

- **Wazuh**: `agent.ip` -> `ipv4`, `agent.name` -> `host`, `rule.id` -> `hash`.
- **Suricata**: `src_ip`/`dest_ip` -> `ipv4`, `dest_port` -> `port`, `proto`.

### 1.6 Run

```bash
cp .env.example .env   # single global env at the workspace root
pnpm --filter ingestion run dev        # tsx watch, port 8080
```

Verification without Docker: `node dist/main.js` boots and reports
`{"status":"degraded","redis":"unreachable"}`; the ioredis client logs
connection errors instead of crashing, so webhook validation still works.

---

## 2. `apps/worker` - Background Processing

### 2.1 Responsibilities (from the architecture doc, section 11)

The worker consumes the `alert.enrich` BullMQ queue produced by Ingestion and
runs the asynchronous, retryable business logic:

- **enrich** - query threat-intel providers for each observable (IP, hash,
  domain, URL) and compute an overall verdict/score,
- **correlate** - group related alerts (same observable, within a 15-minute
  window) into incidents.

Persistence to PostgreSQL is **not wired in yet**: `packages/db` exists and is
verified against the live DB, but the worker still keeps incidents in an
in-memory store - swapping that in is the next step (section 8).

### 2.2 File structure

```text
apps/worker/
├── package.json              # bullmq, ioredis, @repo/threat-intel; scripts: dev/build/start/lint/check-types/demo
├── tsconfig.json             # extends @repo/typescript-config
├── eslint.config.js          # extends @repo/eslint-config
├── scratch/
│   └── push-demo-job.ts      # enqueue 3 sample alerts for manual verification
└── src/
    ├── main.ts               # Redis connection, Worker startup, graceful shutdown (SIGINT/SIGTERM)
    ├── config.ts             # loads global .env -> REDIS_URL, REDIS_QUEUE, WORKER_CONCURRENCY
    ├── types/
    │   └── sentinel.ts       # SentinelAlert mirror (until packages/schemas lands)
    ├── consumers/
    │   └── alert.consumer.ts # BullMQ Worker on "alert.enrich": enrich -> correlate -> return result
    └── jobs/
        ├── enrich-alert.job.ts   # threat-intel lookups per observable, verdict/score
        └── correlate-alert.job.ts # in-memory IncidentStore, grouping by shared observable
```

### 2.3 Behaviour

- **Producer**: Ingestion enqueues a `Queue.add("enrich", alert)` job with
  `attempts: 3` and exponential backoff (`apps/ingestion/src/publisher/redis.publisher.ts`).
- **Consumer**: BullMQ `Worker` on `REDIS_QUEUE` (`alert.enrich`) runs jobs with
  `WORKER_CONCURRENCY` parallelism.
- **Enrichment** is idempotent (read-only remote lookups), so BullMQ retries
  are safe. Unconfigured/failed providers land on `threatIntel[].failures` and
  never abort the job.
- **Correlation**: alerts sharing an `ipv4/ipv6/hash/domain/url` observable
  within 15 minutes fold into one incident; otherwise a new incident opens.
- **Graceful shutdown**: `worker.close()` finishes in-flight jobs before the
  Redis connection is closed.

### 2.4 Run

```bash
pnpm --filter @repo/threat-intel run build   # once - worker imports the built package
pnpm --filter worker run dev                # tsx watch
```

In another terminal, enqueue sample alerts:

```bash
pnpm --filter worker run demo
```

Expect output like:

```
[worker] processing alert demo_wazuh_ssh_001 (wazuh, severity 9)
[worker] enriched demo_wazuh_ssh_001 -> verdict unknown, score 0, 2 intel result(s)
[worker] correlated into inc_3d93b1a4-... (2 alert(s) so far)
[worker] job 1 completed
```

`verdict unknown` until `VT_API_KEY` / `ABUSEIPDB_API_KEY` are set in the
global `.env`; correlation still works because it is observable-based.

---

## 3. `infra/mock-environment` - Attack Simulation Lab

A sandboxed Docker Compose environment (`name: sentinel-mock`) that produces
real alerts and exercises the Ingestion service end-to-end.

### 3.1 Services (`docker-compose.yml`)

| Service        | Image / build            | Network mode | Ports               | Role                                        |
| -------------- | ------------------------ | ------------ | ------------------- | ------------------------------------------- |
| `redis`        | `redis:7-alpine`         | `mocknet`    | `6379`              | BullMQ queue (`alert.enrich`) backed by Redis |
| `dvwa`         | `vulnerables/web-dvwa`   | `mocknet`    | `8081` -> 80        | Vulnerable web target                       |
| `suricata`     | `./suricata` (Debian)    | **host**     | -                   | Network IDS sniffing the `mocknet` bridge   |
| `attacker`     | `./attacker` (Alpine)    | `mocknet`    | -                   | `nmap`, `hydra`, `sshpass`, `curl` toolbox  |
| `wazuh-manager`| `wazuh/wazuh-manager:4.14.7` | `mocknet` | `1514/1515/55000`   | Correlates agent events, forwards alerts    |
| `wazuh-agent`  | `./wazuh-agent` (Ubuntu) | `mocknet`    | `2222` -> 22        | SSH target monitored by the Wazuh agent     |

Network: `mocknet` = `172.20.0.0/24`. The Suricata container runs with
`network_mode: host` so it captures the bridge that backs `mocknet`.

### 3.2 File inventory

```text
infra/mock-environment/
├── docker-compose.yml          # 6 services, mocknet 172.20.0.0/24
├── README.md                   # full setup + attack simulation + verification guide
├── attacker/
│   └── Dockerfile              # alpine + nmap hydra sshpass curl
├── suricata/
│   ├── Dockerfile              # debian-bookworm + suricata, ET rules, local rules
│   ├── entrypoint.sh           # bridge detection, host.docker.internal fallback, tail+forward
│   ├── config/
│   │   └── local.rules         # SID 200000x lab rules (port scan, SSH brute force, SQLi, cmd injection)
│   └── scripts/
│       ├── detect-bridge.py    # finds interface whose IP is in MONITOR_SUBNET
│       └── eve-forwarder.py    # tails eve.json, POSTs event_type=="alert" lines
├── wazuh-manager/
│   └── ossec.conf              # standalone manager; custom-remote -> /webhooks/wazuh
└── wazuh-agent/
    ├── Dockerfile              # ubuntu 22.04 + openssh-server + rsyslog + wazuh-agent
    ├── entrypoint.sh           # resolves manager, registers agent (retries), starts sshd + agentd
    └── config/
        ├── ossec.conf          # agent config: manager addr, syscheck on /etc
        └── sshd_config         # weak-creds SSH target
```

### 3.3 How alerts reach the Ingestion service

**Wazuh path** (`wazuh-manager/ossec.conf`):

```xml
<integration>
  <name>custom-remote</name>
  <hook_url>http://host.docker.internal:8080/webhooks/wazuh</hook_url>
  <level>6</level>
</integration>
```

Every correlated alert with `level >= 6` is POSTed as full alert JSON to the
Ingestion webhook. The manager's Wazuh API is exposed on `:55000` with
`admin` / `ChangeMe123!` (matches the global env `WAZUH_API_*`; change both together).

**Suricata path** (Suricata cannot send webhooks natively):

1. Suricata writes `eve.json`; the entrypoint runs it with
   `-i <mocknet bridge>` (`detect-bridge.py` finds the interface, falling back
   to `eth0`).
2. `tail -F -n 0 /var/log/suricata/eve.json | eve-forwarder.py` posts every
   `event_type == "alert"` line to `/webhooks/suricata`.
3. With host networking, `host.docker.internal` may not resolve; the entrypoint
   rewrites it to the default gateway IP.

**Local rules** (`suricata/config/local.rules`) guarantee deterministic
detections even when the ET Open ruleset download is skipped:

| SID      | Detection                                        |
| -------- | ------------------------------------------------ |
| 2000001  | TCP port scan (25+ SYN in 5 s)                   |
| 2000002  | SSH brute force (15+ connections in 10 s)        |
| 2000003  | SQL injection probe in HTTP URI                  |
| 2000004  | Command injection probe (`/etc/passwd`)          |

### 3.4 Start the lab

```bash
cd infra/mock-environment
docker compose up --build -d
```

Prerequisites: Docker Desktop 4.34+ (WSL2 backend, for host networking),
~4 GB free RAM. The Wazuh manager needs 30-60 s to boot and logs harmless
Filebeat/indexer errors (no indexer in this lab).

Full attack walkthrough (nmap scan -> Suricata, hydra/sshpass brute force ->
Wazuh, SQLi -> Suricata) and verification steps (Redis
`zcard bull:alert.enrich:completed`) are in
[`infra/mock-environment/README.md`](../infra/mock-environment/README.md).

---

## 4. `packages/threat-intel` - Threat Intelligence Abstraction

A reusable domain package (architecture doc section 12) that standardizes
queries to external security APIs behind a single service. The AI agent calls
one method and never touches vendor endpoints directly.

### 4.1 Providers (all live, no mock)

| Provider      | Requires key | Endpoint                                                                 |
| ------------- | ------------ | ------------------------------------------------------------------------ |
| `virustotal`  | yes          | `GET /api/v3/{files\|ip_addresses\|domains\|urls}/...` (header `x-apikey`) |
| `abuseipdb`   | yes          | `GET /api/v2/check?ipAddress=` (header `Key`)                             |
| `mitre`       | no           | ATT&CK enterprise STIX bundle (~30 MB, lazy single-flight cache)          |
| `cve`         | no           | NVD REST API `cves/2.0?cveId=`                                            |

### 4.2 Files

```text
packages/threat-intel/
├── src/
│   ├── index.ts            # public exports
│   ├── types.ts            # ThreatIntelResult, ProviderConfig, ProviderErrorCode
│   ├── errors.ts           # ProviderError (not_configured | http_error | parse_error)
│   ├── http.ts             # fetchJson helper (AbortController timeout)
│   ├── normalizer.ts       # vendor payload -> ThreatIntelResult
│   ├── service.ts          # ThreatIntelligenceService (worst-verdict aggregation)
│   └── providers/          # virustotal, abuseipdb, mitre, cve
├── scratch/demo.ts         # live manual-verification script
└── README.md
```

### 4.3 Behaviour

- Keyed providers read `VT_API_KEY` / `ABUSEIPDB_API_KEY` from the single global
  `.env` automatically (`createThreatIntelService()`); explicit
  `{ virustotal: { apiKey } }` config overrides the env value.
- Unconfigured or failed providers never abort a query: they land on
  `AggregatedThreatIntel.failures` (`{ provider, code, message }`).
- `ti.providerStatus()` reports `configured` / `requiresApiKey` per provider.
- `analyzeIp()` aggregates VirusTotal + AbuseIPDB (worst verdict wins, max
  score); `lookupTechnique` / `lookupTactic` / `lookupCve` are keyless.
- CVE normalizer surfaces CVSS score, severity and NVD references.

---

## 5. `packages/db` - Database Access (Prisma 7 + Supabase PostgreSQL)

### 5.1 Responsibilities

`@repo/db` is the single source of truth for Postgres access across the
platform. It owns the Prisma schema, the generated client, and the repository
classes that `apps/api` / `apps/worker` call instead of touching Prisma
directly. PostgreSQL is hosted by **Supabase**; the Prisma client (driver
adapter) is the only database access path - no Supabase REST/PostgREST layer.

Prisma 7 moved connection URLs out of the schema:

- `prisma.config.ts` holds the Migrate connection strings - `DATABASE_URL`
  (normal connection) and `DIRECT_URL` (Supabase "direct" connection, used by
  `prisma migrate` because the transaction pooler is incompatible with Prisma
  Migrate). It loads the root `.env` via `dotenv`.
- The runtime `PrismaClient` is created with a **driver adapter**
  (`@prisma/adapter-pg`, wraps `pg`) using `DATABASE_URL` (the Supabase
  transaction-mode pooler, port 6543).
- Connection strings are in the root `.env`; special characters in the password
  must be URL-encoded (e.g. `#` -> `%23`).

### 5.2 File structure

```text
packages/db/
├── package.json              # prisma CLI + @prisma/client; scripts: generate/db:push/migrate/studio
├── tsconfig.json             # extends @repo/typescript-config
├── eslint.config.mjs         # extends @repo/eslint-config
├── prisma.config.ts          # Prisma 7 config: schema/migrations paths, datasource URLs, dotenv
├── prisma/
│   └── schema.prisma         # datasource (provider only) + 9 models + enums
├── scratch/
│   └── test-db.ts            # create/read connectivity check (pnpm --filter @repo/db run demo)
└── src/
    ├── client.ts             # PrismaClient singleton (globalThis-cached) with PrismaPg adapter
    ├── index.ts              # exports prisma, repositories, and the full generated client
    ├── generated/prisma/     # prisma generate output (gitignored, regenerated on install)
    └── repositories/
        ├── alert.repository.ts        # upsertBySourceId, findRecent, attachToIncident, ...
        ├── incident.repository.ts     # createIncident, refreshSeverity, listByStatus, ...
        └── conversation.repository.ts # createConversation, addMessage, getHistory, ...
```

### 5.3 Models (`prisma/schema.prisma`)

`User`, `Alert`, `ThreatIntelResult`, `Incident`, `Investigation`, `AgentRun`,
`Conversation`, `Message`, `Notification` - each with status enums
(`AlertStatus`, `IncidentStatus`, `NotificationStatus`, ...). Key design points:

- `Alert.sourceId` is `@unique` - the natural key from Ingestion, so a retried
  BullMQ job can `upsertBySourceId` without duplicating the alert.
- `Alert.observables` / `Alert.raw` / `Incident.correlationKeys` are `Json`
  columns (normalized SentinelAlert observables, plus the original payload).
- `Alert.incidentId` is nullable with `onDelete: SetNull`; deleting an incident
  keeps the alerts.
- `ThreatIntelResult` is 1:1 with `Alert` (`alertId @unique`, cascade delete).

### 5.4 Run

The Prisma client is the only database access path. Connection strings live in
the root `.env` (`DATABASE_URL` = runtime via the transaction pooler,
`DIRECT_URL` = direct connection for `prisma migrate`).

```bash
pnpm install                          # postinstall -> prisma generate -> src/generated/prisma
pnpm --filter @repo/db run db:push    # sync schema changes to Supabase
pnpm --filter @repo/db run demo       # create/read connectivity check
pnpm --filter @repo/db run studio     # browse the data (optional)
```

Schema is already live on the project (`dyfcfljazlgwwzwkwzuv`): 9 tables +
enums. `demo` was verified against the live DB (create + read, Prisma 7 +
`@prisma/adapter-pg`). Note: special characters in the DB password must be
URL-encoded in the connection string (e.g. `#` -> `%23`).

---

## 6. Repo-wide changes

### 6.1 `turbo.json`

Added `globalEnv` so Turborepo includes the ingestion, threat-intel and db
environment variables in its hashing:

```json
"globalEnv": [
  "PORT", "HOST", "REDIS_URL", "REDIS_QUEUE", "INGEST_TOKEN",
  "WORKER_CONCURRENCY", "VT_API_KEY", "ABUSEIPDB_API_KEY",
  "DATABASE_URL", "DIRECT_URL", "NODE_ENV"
]
```

### 6.2 `pnpm-lock.yaml`

Refreshed by `pnpm install` (adds `express`, `bullmq`, `ioredis`, `zod`, `tsx`,
`prisma` 7.x, `@prisma/client`, `@prisma/adapter-pg`, `pg` and the dev toolchain
for the new packages).

---

## 7. Verification performed this session

| Check                                    | Result                                              |
| ---------------------------------------- | --------------------------------------------------- |
| Compose YAML parse (`pyyaml`)            | valid; 6 services, host-network/ports conflicts OK  |
| `pnpm turbo run build`                   | pass                                                |
| `pnpm lint` (ingestion, worker, ui, web, threat-intel, db) | 6/6 successful                                 |
| `pnpm check-types` (all packages)        | 7/7 successful                                      |
| Boot smoke test (`node dist/main.js`)    | `/health` -> `503 degraded`, invalid body -> `400` with per-field zod errors; process survives Redis-down |
| `@repo/threat-intel` live demo           | MITRE T1110 (real STIX bundle), CVE-2021-44228 (NVD, CVSS 10), VT/AbuseIPDB report `not_configured` without keys |
| Worker end-to-end (real Redis)           | Ingestion webhook -> BullMQ job -> enrich + correlate; same-IP alerts folded into one incident, 5/5 jobs completed, 0 failed |
| `@repo/db` scaffold                      | `prisma validate` + `generate` (Prisma 7.9.1) pass; generated client regenerates from clean; check-types/lint/build green; `demo` verified against the live Supabase DB (`User` upsert + `Message` count via `@prisma/adapter-pg`); 9 tables synced |

---

## 8. Next steps (out of scope for this session)

- Persist enriched alerts/incidents via `packages/db` + PostgreSQL (worker
  correlation is currently in-memory) - `DATABASE_URL`/`DIRECT_URL` are set, so
  wire the repositories into the worker.
- A `Zeek` source alongside Wazuh/Suricata (per architecture section 10).
- Wire `@repo/threat-intel` into the AI agent's tool layer.
- Shared contracts in `packages/schemas` (e.g. `AlertCreatedEvent`) so
  ingestion and worker stop mirroring `SentinelAlert`.
- `incident` / `notification` consumers and a scheduled cleanup job.
