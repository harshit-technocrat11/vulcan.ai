import type {
  ThreatIntelKind,
  ThreatIntelProviderName,
  ThreatIntelResult,
  Verdict,
} from "./types.js";

export interface VerdictThresholds {
  malicious: number;
  suspicious: number;
}

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  malicious: 70,
  suspicious: 40,
};

/** Map a 0..100 score to a verdict using the given thresholds. */
export function verdictFromScore(
  score: number,
  thresholds: VerdictThresholds = DEFAULT_THRESHOLDS,
): Verdict {
  if (score >= thresholds.malicious) return "malicious";
  if (score >= thresholds.suspicious) return "suspicious";
  if (score > 0) return "benign";
  return "unknown";
}

/** Clamp any number into 0..100. */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Clamp any number into 0..1. */
export function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, confidence));
}

function buildResult(
  provider: ThreatIntelProviderName,
  kind: ThreatIntelKind,
  score: number,
  confidence: number,
  summary: string,
  tags: string[],
  references: string[],
  raw: Record<string, unknown>,
): ThreatIntelResult {
  return {
    provider,
    kind,
    verdict: verdictFromScore(score),
    score: clampScore(score),
    confidence: clampConfidence(confidence),
    summary,
    tags,
    references,
    fetchedAt: new Date().toISOString(),
    raw,
  };
}

/**
 * Normalize a VirusTotal-style payload (`data.attributes.last_analysis_stats`)
 * into a standardized result. `kind` reflects what was queried (hash, ip,
 * domain or url).
 */
export function normalizeVirusTotal(
  raw: unknown,
  kind: ThreatIntelKind,
): ThreatIntelResult {
  const payload = raw as Record<string, unknown>;
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const attributes = (data.attributes ?? {}) as Record<string, unknown>;
  const stats =
    (attributes.last_analysis_stats as Record<string, number> | undefined) ?? {};
  const harmless = stats.harmless ?? 0;
  const malicious = stats.malicious ?? 0;
  const suspicious = stats.suspicious ?? 0;
  const undetected = stats.undetected ?? 0;
  const total = harmless + malicious + suspicious + undetected;

  const score = total > 0 ? (malicious / total) * 100 : 0;
  const confidence =
    total > 0
      ? Math.min(1, (malicious + suspicious + undetected + harmless) / 100)
      : 0;

  const tags = ["virustotal"];
  if (malicious > 0) tags.push(`malicious-engine=${malicious}`);
  if (suspicious > 0) tags.push(`suspicious-engine=${suspicious}`);
  if (total > 0) tags.push(`detection=${malicious}/${total}`);

  return buildResult(
    "virustotal",
    kind,
    score,
    confidence,
    `${malicious}/${total} engines flagged this as malicious.`,
    tags,
    ["https://www.virustotal.com/gui/search"],
    payload,
  );
}

/**
 * Normalize an AbuseIPDB-style payload (`data.abuseConfidenceScore`) into a
 * standardized result.
 */
export function normalizeAbuseIPDB(raw: unknown): ThreatIntelResult {
  const payload = raw as Record<string, unknown>;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const score = Number(data.abuseConfidenceScore ?? 0);
  const totalReports = Number(data.totalReports ?? 0);

  return buildResult(
    "abuseipdb",
    "ip",
    score,
    Math.min(1, totalReports > 0 ? totalReports / 100 : 0),
    totalReports > 0
      ? `IP reported ${totalReports} time(s); abuse confidence ${score}%.`
      : "No reports on record for this IP.",
    ["abuseipdb"],
    ["https://www.abuseipdb.com"],
    payload,
  );
}

/** Normalize a MITRE ATT&CK technique record. */
export function normalizeMitre(raw: unknown): ThreatIntelResult {
  const payload = raw as Record<string, unknown>;
  const id = String(payload.techniqueId ?? "");
  const tactic = String(payload.tactic ?? "unknown");

  return buildResult(
    "mitre",
    "ttp",
    50,
    0.8,
    `${id} ${String(payload.name ?? "")} (${tactic}).`,
    [tactic, id, "mitre-attack"],
    [String(payload.url ?? "https://attack.mitre.org/")],
    payload,
  );
}

const CVE_SCORE_FROM_SEVERITY: Record<string, number> = {
  critical: 95,
  high: 75,
  medium: 50,
  low: 25,
};

/** Normalize a CVE record into a standardized result. */
export function normalizeCve(raw: unknown): ThreatIntelResult {
  const payload = raw as Record<string, unknown>;
  const severity = String(payload.severity ?? "unknown").toLowerCase();
  const score = CVE_SCORE_FROM_SEVERITY[severity] ?? 45;
  const cveId = String(payload.id ?? payload.cveId ?? "");
  const cvss =
    typeof payload.cvss === "number" ? Number(payload.cvss.toFixed(1)) : undefined;

  const references: string[] = [];
  if (typeof payload.url === "string") references.push(payload.url);
  if (Array.isArray(payload.references)) {
    for (const ref of payload.references) {
      if (typeof ref === "string" && !references.includes(ref)) {
        references.push(ref);
      }
    }
  }

  const tags = [severity, cveId, "cve"];
  if (cvss !== undefined) tags.push(`cvss=${cvss}`);

  return buildResult(
    "cve",
    "cve",
    score,
    0.9,
    `${cveId} (${severity}${cvss !== undefined ? `, CVSS ${cvss}` : ""}): ${String(payload.description ?? "")}`,
    tags,
    references,
    payload,
  );
}
