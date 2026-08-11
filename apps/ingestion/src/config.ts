import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the single global env at the workspace root (vulcan.ai/.env).
// Walks up from this file (src/ or dist/ are both one level below the
// package dir), so it works with tsx and compiled output alike.
loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  // BullMQ queue consumed by the Worker app. Producer (ingestion) and
  // consumer (worker) must agree on this name.
  redisQueue: process.env.REDIS_QUEUE ?? "alert.enrich",
  ingestToken: process.env.INGEST_TOKEN ?? "",
} as const;
