import {
  createThreatIntelService,
  type AggregatedThreatIntel,
  type ThreatIntelligenceService,
  type Verdict,
} from "@repo/threat-intel";
import type { SentinelAlert, SentinelObservable } from "../types/sentinel.js";

export interface EnrichedAlert {
  alert: SentinelAlert;
  /** Per-observable aggregated threat-intel results (empty when no keys). */
  threatIntel: AggregatedThreatIntel[];
  /** Worst verdict observed across all observables. */
  verdict: Verdict;
  /** Highest risk score observed across all observables. */
  score: number;
  enrichedAt: string;
}

const VERDICT_RANK: Record<Verdict, number> = {
  benign: 0,
  unknown: 1,
  suspicious: 2,
  malicious: 3,
};

/** Dispatch an observable to the matching threat-intel lookup (live HTTP). */
async function lookupObservable(
  ti: ThreatIntelligenceService,
  observable: SentinelObservable,
): Promise<AggregatedThreatIntel | null> {
  switch (observable.type) {
    case "ipv4":
    case "ipv6":
      return ti.analyzeIp(observable.value);
    case "hash":
      return ti.analyzeHash(observable.value);
    case "domain":
      return ti.analyzeDomain(observable.value);
    case "url":
      return ti.analyzeUrl(observable.value);
    default:
      // port / user / file / host have no threat-intel source yet.
      return null;
  }
}

/**
 * Enrich an alert with threat-intel context for each observable.
 *
 * Idempotent by design: it only reads remote data and computes derived fields,
 * so a BullMQ retry can re-run it safely. Providers that are unconfigured or
 * fail are reported on `threatIntel[].failures` and never abort the job.
 */
export async function enrichAlert(alert: SentinelAlert): Promise<EnrichedAlert> {
  const ti = createThreatIntelService(); // reads keys from the global .env
  const threatIntel: AggregatedThreatIntel[] = [];

  for (const observable of alert.observables) {
    const result = await lookupObservable(ti, observable);
    if (result) threatIntel.push(result);
  }

  const verdict =
    threatIntel.length > 0
      ? threatIntel.reduce(
          (worst, r) => (VERDICT_RANK[r.verdict] > VERDICT_RANK[worst] ? r.verdict : worst),
          "benign" as Verdict,
        )
      : "unknown";

  const score = Math.max(0, ...threatIntel.map((r) => r.score));

  return {
    alert,
    threatIntel,
    verdict,
    score,
    enrichedAt: new Date().toISOString(),
  };
}
