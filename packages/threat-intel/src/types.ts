export type ThreatIntelProviderName =
  | "virustotal"
  | "abuseipdb"
  | "mitre"
  | "cve";

/**
 * The kind of thing being looked up. Providers answer different subsets;
 * the service aggregates them under a single kind.
 */
export type ThreatIntelKind =
  | "ip"
  | "domain"
  | "url"
  | "hash"
  | "ttp"
  | "cve";

export type Verdict = "malicious" | "suspicious" | "benign" | "unknown";

export type ProviderErrorCode = "not_configured" | "http_error" | "parse_error";

/**
 * Configuration that a consumer (or the AI agent host) provides when wiring
 * real credentials. VirusTotal and AbuseIPDB require an `apiKey`; MITRE and
 * CVE are keyless.
 */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * The standardized result every provider returns. The AI agent only ever sees
 * this shape, regardless of which vendor produced the data.
 */
export interface ThreatIntelResult {
  provider: ThreatIntelProviderName;
  kind: ThreatIntelKind;
  verdict: Verdict;
  /** 0..100 risk score (100 = most severe/malicious). */
  score: number;
  /** 0..1 confidence in the verdict. */
  confidence: number;
  summary: string;
  tags: string[];
  references: string[];
  /** ISO 8601 timestamp of when the provider was queried. */
  fetchedAt: string;
  /** The raw, unmodified provider payload. */
  raw: Record<string, unknown>;
}

/** MITRE ATT&CK technique/sub-technique record. */
export interface MitreTTP {
  techniqueId: string; // e.g. "T1059"
  name: string;
  tactic: string;
  description: string;
  detection?: string;
  url: string;
}

/** Aggregated view across all providers consulted for one observable. */
export interface AggregatedThreatIntel {
  kind: ThreatIntelKind;
  value: string;
  verdict: Verdict;
  score: number;
  confidence: number;
  results: ThreatIntelResult[];
  /** Providers that could not be consulted (missing key, HTTP error, ...). */
  failures: Array<{
    provider: ThreatIntelProviderName;
    code: ProviderErrorCode;
    message: string;
  }>;
}
