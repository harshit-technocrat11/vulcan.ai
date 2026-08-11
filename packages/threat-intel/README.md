# `@repo/threat-intel`

Reusable threat-intelligence abstraction for the Sentinel platform. It
standardizes queries to external security sources (VirusTotal, AbuseIPDB,
MITRE ATT&CK, CVE) behind one service, so consumers (e.g. the AI agent) never
deal with multiple vendor APIs directly.

```text
AI Agent
   │
   ▼
Threat Intelligence Service        <-- single entry point (src/service.ts)
   │
   ├── VirusTotalProvider   (hash / ip / domain / url)   needs apiKey
   ├── AbuseIPDBProvider    (ip reputation)              needs apiKey
   ├── MitreProvider        (TTP mapping)                keyless
   └── CveProvider          (vulnerability details)      keyless
```

All providers make **live HTTP calls** using Node's global `fetch`. Add your
API keys when you have them - nothing else changes.

## Setup

VirusTotal and AbuseIPDB require API keys; MITRE and CVE work without any.

Keys are read from the **single global env** at the workspace root
(`vulcan.ai/.env`, copied from `.env.example`) — you only fill them in there:

```bash
cp .env.example .env   # from the workspace root
# then set:
VT_API_KEY=...
ABUSEIPDB_API_KEY=...
```

## Usage

```ts
import { createThreatIntelService } from "@repo/threat-intel";

// Reads VT_API_KEY / ABUSEIPDB_API_KEY from the global .env automatically.
const ti = createThreatIntelService();

const ip = await ti.analyzeIp("185.220.101.42");
// -> AggregatedThreatIntel { verdict, score, results, failures }

const hash = await ti.analyzeHash("44d88612fea8a8f36de82e1278abb02f");
const url = await ti.analyzeUrl("http://evil.example.org/payload.exe");
const ttp = await ti.lookupTechnique("T1110");    // MITRE, keyless
const cve = await ti.lookupCve("CVE-2021-44228"); // NVD, keyless
```

Providers that are not configured (or fail during a lookup) never abort a
query: they are reported on `AggregatedThreatIntel.failures` with a
`ProviderErrorCode` (`not_configured` | `http_error` | `parse_error`), so the
agent can see exactly why a source is missing.

`ti.providerStatus()` lists which providers are ready:

```ts
ti.providerStatus();
// {
//   virustotal: { configured: false, requiresApiKey: true },
//   abuseipdb:  { configured: false, requiresApiKey: true },
//   mitre:      { configured: true,  requiresApiKey: false },
//   cve:        { configured: true,  requiresApiKey: false },
// }
```

## Standardized result (`ThreatIntelResult`)

Every provider returns this shape; `raw` preserves the original payload:

```ts
{
  provider: "virustotal" | "abuseipdb" | "mitre" | "cve",
  kind: "ip" | "domain" | "url" | "hash" | "ttp" | "cve",
  verdict: "malicious" | "suspicious" | "benign" | "unknown",
  score: number,        // 0..100
  confidence: number,   // 0..1
  summary: string,
  tags: string[],
  references: string[],
  fetchedAt: string,    // ISO 8601
  raw: Record<string, unknown>,
}
```

`ThreatIntelligenceService.analyzeIp()` aggregates VirusTotal + AbuseIPDB: the
worst verdict wins and the score is the maximum observed.

## Live endpoints used

| Provider    | Endpoint                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| VirusTotal  | `GET https://www.virustotal.com/api/v3/{files\|ip_addresses\|domains\|urls}/...` (header `x-apikey`) |
| AbuseIPDB   | `GET https://api.abuseipdb.com/api/v2/check?ipAddress=` (header `Key`)    |
| MITRE       | `GET https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json` (keyless, ~30 MB, lazy + cached) |
| CVE         | `GET https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=` (keyless)   |

Notes:

- **VirusTotal** URL lookups use the base64url-encoded URL id
  (`GET /api/v3/urls/{url-id}`), so no POST/scan is needed.
- **MITRE** downloads the enterprise STIX bundle once per process (single-flight,
  in-memory index). Use `ti`'s provider `.clearCache()` to force a refresh.
- **NVD** free tier is rate limited (~5 req / 30 s). Fine for a lab.

## Scripts

```bash
pnpm --filter @repo/threat-intel run check-types   # tsc --noEmit
pnpm --filter @repo/threat-intel run lint          # eslint --max-warnings 0
pnpm --filter @repo/threat-intel run demo          # tsx scratch/demo.ts (live)
```

## Files

```text
src/
├── index.ts                    # public exports
├── types.ts                    # ThreatIntelResult, ProviderConfig, error codes
├── errors.ts                   # ProviderError
├── http.ts                     # fetchJson helper (timeout + typed errors)
├── normalizer.ts               # vendor payload -> ThreatIntelResult
├── service.ts                  # ThreatIntelligenceService (aggregation)
└── providers/
    ├── index.ts
    ├── virustotal.ts
    ├── abuseipdb.ts
    ├── mitre.ts
    └── cve.ts
scratch/demo.ts                 # runnable manual-verification script
```

## Roadmap

1. **Caching**: short TTL cache keyed by observable to avoid duplicate
   upstream calls (especially NVD rate limits).
2. **Promote to an app** only if the subsystem needs independent scaling.
