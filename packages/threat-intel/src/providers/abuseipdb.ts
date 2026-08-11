import { ProviderError } from "../errors.js";
import { fetchJson } from "../http.js";
import { normalizeAbuseIPDB } from "../normalizer.js";
import type { ProviderConfig, ThreatIntelResult } from "../types.js";

const DEFAULT_BASE_URL = "https://api.abuseipdb.com/api/v2";

/**
 * AbuseIPDB provider. Requires an apiKey (sent via the `Key` header).
 *
 * Query: GET /api/v2/check?ipAddress={ip}
 */
export class AbuseIPDBProvider {
  readonly name = "abuseipdb" as const;

  constructor(private readonly config: ProviderConfig = {}) {}

  /** True when an apiKey has been provided. */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  analyzeIp(ip: string): Promise<ThreatIntelResult> {
    if (!this.isConfigured()) {
      return Promise.reject(
        new ProviderError(
          this.name,
          "not_configured",
          "AbuseIPDBProvider requires an apiKey; configure it via createThreatIntelService({ abuseipdb: { apiKey } })",
        ),
      );
    }

    const url = `${this.config.baseUrl ?? DEFAULT_BASE_URL}/check?ipAddress=${encodeURIComponent(ip)}`;
    return fetchJson<Record<string, unknown>>(this.name, url, {
      headers: {
        Key: this.config.apiKey as string,
        Accept: "application/json",
      },
      timeoutMs: this.config.timeoutMs,
    }).then(normalizeAbuseIPDB);
  }
}
