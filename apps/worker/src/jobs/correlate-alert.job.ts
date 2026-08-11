import { randomUUID } from "node:crypto";
import type { SentinelObservable } from "../types/sentinel.js";
import type { EnrichedAlert } from "./enrich-alert.job.js";

export interface Incident {
  id: string;
  title: string;
  severity: number;
  status: "open";
  alertIds: string[];
  observables: string[];
  correlationKeys: string[];
  openedAt: string;
  updatedAt: string;
}

/** Correlate alerts sharing the same observable within this time window. */
const CORRELATION_WINDOW_MS = 15 * 60 * 1000;

function correlationKeys(observables: SentinelObservable[]): string[] {
  const keyable: SentinelObservable["type"][] = [
    "ipv4",
    "ipv6",
    "hash",
    "domain",
    "url",
  ];
  return observables
    .filter((o) => keyable.includes(o.type))
    .map((o) => o.value)
    .filter((v) => v.length > 0);
}

/**
 * In-memory incident store until `packages/db` exists. Lost on restart - that
 * is acceptable for the current scope; persistence is a follow-up.
 */
export class IncidentStore {
  private readonly incidents = new Map<string, Incident>();

  list(): Incident[] {
    return [...this.incidents.values()];
  }

  /**
   * Attach the enriched alert to an open incident sharing a key observable,
   * or create a new incident when nothing matches within the window.
   */
  correlate(enriched: EnrichedAlert): Incident {
    const keys = correlationKeys(enriched.alert.observables);
    const now = Date.now();

    const existing = this.findOpenIncident(keys, now);
    if (existing) {
      existing.alertIds.push(enriched.alert.id);
      existing.observables = [...new Set([...existing.observables, ...keys])];
      existing.updatedAt = new Date(now).toISOString();
      return existing;
    }

    const incident: Incident = {
      id: `inc_${randomUUID()}`,
      title: enriched.alert.title,
      severity: enriched.alert.severity,
      status: "open",
      alertIds: [enriched.alert.id],
      observables: keys,
      correlationKeys: keys,
      openedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.incidents.set(incident.id, incident);
    return incident;
  }

  private findOpenIncident(keys: string[], now: number): Incident | undefined {
    for (const incident of this.incidents.values()) {
      const fresh =
        now - Date.parse(incident.updatedAt) <= CORRELATION_WINDOW_MS;
      const sharesKey = keys.some((k) => incident.correlationKeys.includes(k));
      if (fresh && sharesKey) return incident;
    }
    return undefined;
  }
}
