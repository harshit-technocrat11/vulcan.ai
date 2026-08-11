import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the single global env at the workspace root (vulcan.ai/.env), same as
// the ingestion app. REDIS_URL / REDIS_QUEUE are shared with the producer.
loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

export const config = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  // BullMQ queue produced by the Ingestion service. Names must match.
  alertQueue: process.env.REDIS_QUEUE ?? "alert.enrich",
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
} as const;
