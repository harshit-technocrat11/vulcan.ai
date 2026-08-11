import { Redis } from "ioredis";
import { config } from "./config.js";
import { IncidentStore } from "./jobs/correlate-alert.job.js";
import { createAlertConsumer } from "./consumers/alert.consumer.js";

async function main(): Promise<void> {
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  redis.on("error", (err) => {
    console.error("[worker] redis error:", err.message);
  });

  const incidentStore = new IncidentStore();
  const worker = createAlertConsumer(
    config.alertQueue,
    redis,
    config.concurrency,
    incidentStore,
  );

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed after retries:`, err.message);
  });
  worker.on("error", (err) => {
    console.error("[worker] worker error:", err.message);
  });

  console.log(
    `[worker] listening on queue "${config.alertQueue}" (concurrency ${config.concurrency})`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, closing worker...`);
    try {
      // Stop processing and finish in-flight jobs before disconnecting.
      await worker.close();
      await redis.quit();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
