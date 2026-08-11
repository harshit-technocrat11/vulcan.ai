/**
 * SentinelAlert mirrors apps/ingestion/src/types/sentinel.ts - the payload the
 * Ingestion service puts on the BullMQ queue.
 *
 * TODO: move this to a shared `packages/schemas` contract (architecture
 * section 15) once we introduce it, so producer and consumer cannot drift.
 */

export type AlertSource = "wazuh" | "suricata";

export type ObservableType =
  | "ipv4"
  | "ipv6"
  | "port"
  | "domain"
  | "hash"
  | "user"
  | "file"
  | "url"
  | "host";

export interface SentinelObservable {
  type: ObservableType;
  value: string;
}

export interface SentinelHost {
  name?: string;
  ip?: string;
}

export interface SentinelAlert {
  id: string;
  source: AlertSource;
  /** Severity on a 1..10 scale (10 = most severe). */
  severity: number;
  title: string;
  description: string;
  /** ISO 8601 timestamp of the original event. */
  timestamp: string;
  host: SentinelHost;
  observables: SentinelObservable[];
  /** The original, unmodified payload from the source tool. */
  raw: Record<string, unknown>;
}
