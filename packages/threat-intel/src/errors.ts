import type { ThreatIntelProviderName } from "./types.js";

/**
 * Typed error raised by threat-intel providers. The service surfaces these on
 * the aggregated result (`.failures`) instead of failing the whole lookup.
 */
export class ProviderError extends Error {
  constructor(
    public readonly provider: ThreatIntelProviderName,
    public readonly code: "not_configured" | "http_error" | "parse_error",
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
