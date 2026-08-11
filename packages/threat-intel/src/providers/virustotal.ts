import { ProviderError } from "../errors.js";
import { fetchJson } from "../http.js";
import { normalizeVirusTotal } from "../normalizer.js";
import type {
  ProviderConfig,
  ThreatIntelKind,
  ThreatIntelResult,
} from "../types.js";

const DEFAULT_BASE_URL = "https://www.virustotal.com/api/v3";

/**
 * VirusTotal provider. Requires an apiKey (sent via the `x-apikey` header).
 *
 * Queries:
 * - hash:    GET /api/v3/files/{hash}
 * - ip:      GET /api/v3/ip_addresses/{ip}
 * - domain:  GET /api/v3/domains/{domain}
 * - url:     GET /api/v3/urls/{url-id}  (url-id = base64url of the URL)
 */
export class VirusTotalProvider {
  readonly name = "virustotal" as const;

  private readonly baseUrl: string;

  constructor(private readonly config: ProviderConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /** True when an apiKey has been provided. */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  analyzeHash(hash: string): Promise<ThreatIntelResult> {
    return this.query("hash", `files/${encodeURIComponent(hash)}`);
  }

  analyzeIp(ip: string): Promise<ThreatIntelResult> {
    return this.query("ip", `ip_addresses/${encodeURIComponent(ip)}`);
  }

  analyzeDomain(domain: string): Promise<ThreatIntelResult> {
    return this.query("domain", `domains/${encodeURIComponent(domain)}`);
  }

  analyzeUrl(url: string): Promise<ThreatIntelResult> {
    const urlId = Buffer.from(url, "utf8").toString("base64url");
    return this.query("url", `urls/${encodeURIComponent(urlId)}`);
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) {
      throw new ProviderError(
        this.name,
        "not_configured",
        "VirusTotalProvider requires an apiKey; configure it via createThreatIntelService({ virustotal: { apiKey } })",
      );
    }
    return { "x-apikey": this.config.apiKey as string };
  }

  private async query(
    kind: ThreatIntelKind,
    path: string,
  ): Promise<ThreatIntelResult> {
    const url = `${this.baseUrl}/${path}`;
    const payload = await fetchJson<Record<string, unknown>>(this.name, url, {
      headers: this.headers(),
      timeoutMs: this.config.timeoutMs,
    });
    return normalizeVirusTotal(payload, kind);
  }
}
