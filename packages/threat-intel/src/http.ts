import { ProviderError } from "./errors.js";
import type { ThreatIntelProviderName } from "./types.js";

export interface HttpOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: BodyInit;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Minimal JSON fetch with an AbortController timeout. Throws ProviderError
 * (code "http_error") on non-2xx, timeouts and network failures.
 */
export async function fetchJson<T>(
  provider: ThreatIntelProviderName,
  url: string,
  options: HttpOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: { Accept: "application/json", ...options.headers },
      body: options.body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const snippet = detail ? `: ${detail.slice(0, 200)}` : "";
      throw new ProviderError(
        provider,
        "http_error",
        `${options.method ?? "GET"} ${url} returned ${res.status}${snippet}`,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new ProviderError(
      provider,
      "http_error",
      aborted
        ? `request to ${url} timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}
