import { ProviderError } from "../errors.js";
import { fetchJson } from "../http.js";
import { normalizeCve } from "../normalizer.js";
import type { ProviderConfig, ThreatIntelResult } from "../types.js";

const DEFAULT_BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";

interface NvdCve {
  id?: string;
  descriptions?: Array<{ lang?: string; value?: string }>;
  metrics?: {
    cvssMetricV31?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
    cvssMetricV30?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
    cvssMetricV2?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
  };
  references?: Array<{ url?: string }>;
}

interface NvdResponse {
  resultsPerPage?: number;
  totalResults?: number;
  vulnerabilities?: Array<{ cve?: NvdCve }>;
}

function convertNvdCve(cve: NvdCve): Record<string, unknown> {
  const descriptions = cve.descriptions ?? [];
  const en = descriptions.find((d) => d.lang === "en") ?? descriptions[0];

  const metrics = cve.metrics ?? {};
  const metric =
    metrics.cvssMetricV31?.[0] ??
    metrics.cvssMetricV30?.[0] ??
    metrics.cvssMetricV2?.[0];
  const cvssData = metric?.cvssData;

  return {
    id: cve.id ?? "",
    severity: String(cvssData?.baseSeverity ?? "unknown").toLowerCase(),
    cvss: cvssData?.baseScore,
    description: typeof en?.value === "string" ? en.value : "",
    url: `https://nvd.nist.gov/vuln/detail/${cve.id ?? ""}`,
    references: (cve.references ?? [])
      .map((ref) => ref.url)
      .filter((url): url is string => typeof url === "string"),
  };
}

/**
 * CVE provider. Keyless: queries the NVD REST API v2.0 (rate limited to
 * ~5 req / 30 s without an API key - fine for a lab).
 *
 * Query: GET /rest/json/cves/2.0?cveId={id}
 */
export class CveProvider {
  readonly name = "cve" as const;

  constructor(private readonly config: ProviderConfig = {}) {}

  /** Always available - no apiKey required. */
  isConfigured(): boolean {
    return true;
  }

  async lookup(cveId: string): Promise<ThreatIntelResult> {
    const id = cveId.toUpperCase();
    const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const response = await fetchJson<NvdResponse>(
      this.name,
      `${base}?cveId=${encodeURIComponent(id)}`,
      { timeoutMs: this.config.timeoutMs ?? 15_000 },
    );

    const cve = response.vulnerabilities?.[0]?.cve;
    if (!cve) {
      throw new ProviderError(
        this.name,
        "parse_error",
        `CVE ${id} was not found in NVD.`,
      );
    }

    return normalizeCve(convertNvdCve(cve));
  }
}
