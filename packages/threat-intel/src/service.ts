import {
  AbuseIPDBProvider,
  CveProvider,
  MitreProvider,
  VirusTotalProvider,
} from "./providers/index.js";
import { ProviderError } from "./errors.js";
import type {
  AggregatedThreatIntel,
  ProviderConfig,
  ThreatIntelKind,
  ThreatIntelProviderName,
  ThreatIntelResult,
  Verdict,
} from "./types.js";

const VERDICT_RANK: Record<Verdict, number> = {
  benign: 0,
  unknown: 1,
  suspicious: 2,
  malicious: 3,
};

interface ProviderStatus {
  configured: boolean;
  requiresApiKey: boolean;
}

type Failures = AggregatedThreatIntel["failures"];

interface ProviderCall {
  provider: ThreatIntelProviderName;
  run: Promise<ThreatIntelResult>;
}

/**
 * The single entry point for consumers (the AI agent / tool layer).
 *
 * The agent never talks to VirusTotal, AbuseIPDB, MITRE or CVE directly; it
 * calls one method here and receives aggregated, normalized results.
 *
 * All providers make live HTTP calls. VirusTotal and AbuseIPDB read their
 * keys from the global env (`VT_API_KEY`, `ABUSEIPDB_API_KEY` in the
 * workspace-root `.env`) by default; explicit config passed to the
 * constructor overrides the env values. MITRE and CVE are keyless.
 *
 * Providers that are not configured (or that fail during a lookup) are
 * reported on the result's `.failures` array instead of aborting the whole
 * query.
 *
 * ```ts
 * const ti = createThreatIntelService(); // reads keys from .env
 * ```
 */
export class ThreatIntelligenceService {
  private readonly providers: {
    virustotal: VirusTotalProvider;
    abuseipdb: AbuseIPDBProvider;
    mitre: MitreProvider;
    cve: CveProvider;
  };

  constructor(
    config: Partial<Record<ThreatIntelProviderName, ProviderConfig>> = {},
  ) {
    const fromEnv = {
      virustotal: { apiKey: process.env.VT_API_KEY },
      abuseipdb: { apiKey: process.env.ABUSEIPDB_API_KEY },
    };
    this.providers = {
      virustotal: new VirusTotalProvider({
        ...fromEnv.virustotal,
        ...config.virustotal,
      }),
      abuseipdb: new AbuseIPDBProvider({
        ...fromEnv.abuseipdb,
        ...config.abuseipdb,
      }),
      mitre: new MitreProvider(config.mitre),
      cve: new CveProvider(config.cve),
    };
  }

  /** Which providers are ready to answer (key presence / keyless). */
  providerStatus(): Record<ThreatIntelProviderName, ProviderStatus> {
    return {
      virustotal: {
        configured: this.providers.virustotal.isConfigured(),
        requiresApiKey: true,
      },
      abuseipdb: {
        configured: this.providers.abuseipdb.isConfigured(),
        requiresApiKey: true,
      },
      mitre: {
        configured: this.providers.mitre.isConfigured(),
        requiresApiKey: false,
      },
      cve: {
        configured: this.providers.cve.isConfigured(),
        requiresApiKey: false,
      },
    };
  }

  /** Combine IP reputation from VirusTotal and AbuseIPDB. */
  async analyzeIp(ip: string): Promise<AggregatedThreatIntel> {
    return this.aggregate("ip", ip, [
      { provider: "virustotal", run: this.providers.virustotal.analyzeIp(ip) },
      { provider: "abuseipdb", run: this.providers.abuseipdb.analyzeIp(ip) },
    ]);
  }

  async analyzeHash(hash: string): Promise<AggregatedThreatIntel> {
    return this.aggregate("hash", hash, [
      { provider: "virustotal", run: this.providers.virustotal.analyzeHash(hash) },
    ]);
  }

  async analyzeDomain(domain: string): Promise<AggregatedThreatIntel> {
    return this.aggregate("domain", domain, [
      {
        provider: "virustotal",
        run: this.providers.virustotal.analyzeDomain(domain),
      },
    ]);
  }

  async analyzeUrl(url: string): Promise<AggregatedThreatIntel> {
    return this.aggregate("url", url, [
      { provider: "virustotal", run: this.providers.virustotal.analyzeUrl(url) },
    ]);
  }

  /** Context on a MITRE ATT&CK technique (how the attack works). */
  async lookupTechnique(techniqueId: string): Promise<ThreatIntelResult> {
    return this.providers.mitre.lookupTechnique(techniqueId);
  }

  async lookupTactic(tactic: string): Promise<ThreatIntelResult[]> {
    return this.providers.mitre.lookupTactic(tactic);
  }

  async lookupCve(cveId: string): Promise<ThreatIntelResult> {
    return this.providers.cve.lookup(cveId);
  }

  /**
   * Run provider calls in parallel; the worst verdict wins and the score is
   * the maximum observed. Failed or unconfigured providers are collected on
   * `.failures` so consumers can see why a source is missing.
   */
  private async aggregate(
    kind: ThreatIntelKind,
    value: string,
    calls: ProviderCall[],
  ): Promise<AggregatedThreatIntel> {
    const settled = await Promise.allSettled(calls.map((call) => call.run));
    const outcomes = settled.map((outcome, index) => ({
      provider: calls[index]?.provider ?? "virustotal",
      outcome,
    }));

    const results: ThreatIntelResult[] = [];
    const failures: Failures = [];

    for (const { provider, outcome } of outcomes) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        const err = outcome.reason;
        if (err instanceof ProviderError) {
          failures.push({ provider: err.provider, code: err.code, message: err.message });
        } else {
          failures.push({
            provider,
            code: "http_error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    let verdict: Verdict = "unknown";
    let score = 0;
    let confidence = 0;

    for (const result of results) {
      if (VERDICT_RANK[result.verdict] > VERDICT_RANK[verdict]) {
        verdict = result.verdict;
      }
      score = Math.max(score, result.score);
      confidence = Math.max(confidence, result.confidence);
    }

    return { kind, value, verdict, score, confidence, results, failures };
  }
}

/** Convenience factory. */
export function createThreatIntelService(
  config: Partial<Record<ThreatIntelProviderName, ProviderConfig>> = {},
): ThreatIntelligenceService {
  return new ThreatIntelligenceService(config);
}
