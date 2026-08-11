import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { SentinelAlert } from "../types/sentinel.js";
import { enrichAlert } from "../jobs/enrich-alert.job.js";
import { IncidentStore } from "../jobs/correlate-alert.job.js";

export interface AlertJobResult {
  alertId: string;
  verdict: string;
  score: number;
  incidentId: string;
}

/**
 * BullMQ worker for the `alert.enrich` queue. Each job runs the enrichment
 * pipeline (threat-intel lookup -> correlation into an incident). The handler
 * returns the result so BullMQ stores it on the completed job.
 */
export function createAlertConsumer(
  queueName: string,
  connection: Redis,
  concurrency: number,
  store: IncidentStore,
): Worker<SentinelAlert, AlertJobResult> {
  const worker = new Worker<SentinelAlert, AlertJobResult>(
    queueName,
    async (job) => {
      console.log(
        `[worker] processing alert ${job.data.id} (${job.data.source}, severity ${job.data.severity})`,
      );

      const enriched = await enrichAlert(job.data);
      const incident = store.correlate(enriched);

      console.log(
        `[worker] enriched ${job.data.id} -> verdict ${enriched.verdict}, score ${enriched.score}, ${enriched.threatIntel.length} intel result(s)`,
      );
      console.log(
        `[worker] correlated into ${incident.id} (${incident.alertIds.length} alert(s) so far)`,
      );

      return {
        alertId: enriched.alert.id,
        verdict: enriched.verdict,
        score: enriched.score,
        incidentId: incident.id,
      };
    },
    {
      connection,
      concurrency,
    },
  );

  return worker;
}
