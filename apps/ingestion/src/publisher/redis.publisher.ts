import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { SentinelAlert } from "../types/sentinel.js";

/**
 * Publishes normalized Sentinel alerts as BullMQ jobs.
 *
 * The ingestion service is a producer only: it validates + normalizes an
 * incoming event and calls `queue.add("enrich", alert)` so the Worker app can
 * pick it up. BullMQ brings built-in retries, backoff and at-least-once
 * delivery - the worker's enrichment handler must stay idempotent.
 */
export class RedisPublisher {
  private readonly redis: Redis;
  private readonly queue: Queue<SentinelAlert>;

  constructor(
    private readonly queueName: string,
    redisUrl: string,
  ) {
    // BullMQ requires maxRetriesPerRequest: null on blocking connections, so
    // we create the ioredis client ourselves instead of letting it pick one.
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.redis.on("error", (err) => {
      console.error("[redis] connection error:", err.message);
    });
    this.queue = new Queue<SentinelAlert>(queueName, {
      connection: this.redis,
    });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  /** Enqueue a normalized alert for enrichment (job name "enrich"). */
  async publish(alert: SentinelAlert): Promise<void> {
    await this.queue.add("enrich", alert, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.redis.quit();
  }
}
