import { createHash } from "node:crypto";
import type {
  SentinelAlert,
  SentinelObservable,
} from "../types/sentinel.js";
import type {
  SuricataAlert,
  WazuhAlert,
} from "../validators/alert.validator.js";

/** Deterministic id derived from the source event, so de-duping works. */
function stableId(parts: string[]): string {
  const hash = createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16);
  return `sentinel-${hash}`;
}

/** Clamp a 1..max value into the 1..10 Sentinel severity scale. */
function clampSeverity(value: number, max: number): number {
  return Math.max(1, Math.min(10, Math.round((value / max) * 10)));
}

export function normalizeWazuh(raw: WazuhAlert): SentinelAlert {
  const level = raw.rule?.level ?? 3;
  const observables: SentinelObservable[] = [];

  if (raw.agent?.ip) {
    observables.push({ type: "ipv4", value: raw.agent.ip });
  }
  if (raw.agent?.name) {
    observables.push({ type: "host", value: raw.agent.name });
  }
  if (raw.rule?.id) {
    observables.push({ type: "hash", value: `rule:${raw.rule.id}` });
  }

  return {
    id: stableId([
      "wazuh",
      raw.agent?.id ?? "0",
      raw.rule?.id ?? "unknown",
      raw.timestamp ?? "",
    ]),
    source: "wazuh",
    severity: clampSeverity(level, 15),
    title: raw.rule?.description ?? "Wazuh alert",
    description: raw.full_log ?? raw.rule?.description ?? "",
    timestamp: raw.timestamp ?? new Date().toISOString(),
    host: {
      name: raw.agent?.name,
      ip: raw.agent?.ip,
    },
    observables,
    raw: raw as unknown as Record<string, unknown>,
  };
}

const suricataSeverityMap: Record<number, number> = {
  1: 10,
  2: 8,
  3: 5,
  4: 3,
};

export function normalizeSuricata(raw: SuricataAlert): SentinelAlert {
  const severity = suricataSeverityMap[raw.alert.severity ?? 3] ?? 5;
  const observables: SentinelObservable[] = [];

  if (raw.src_ip) {
    observables.push({ type: "ipv4", value: raw.src_ip });
  }
  if (raw.dest_ip) {
    observables.push({ type: "ipv4", value: raw.dest_ip });
  }
  if (raw.dest_port !== undefined) {
    observables.push({ type: "port", value: String(raw.dest_port) });
  }
  if (raw.proto) {
    observables.push({ type: "port", value: raw.proto });
  }

  return {
    id: stableId([
      "suricata",
      String(raw.alert.signature_id ?? 0),
      raw.timestamp,
    ]),
    source: "suricata",
    severity,
    title: raw.alert.signature,
    description: raw.alert.category
      ? `${raw.alert.category} - ${raw.alert.signature}`
      : raw.alert.signature,
    timestamp: raw.timestamp,
    host: { ip: raw.dest_ip },
    observables,
    raw: raw as unknown as Record<string, unknown>,
  };
}
