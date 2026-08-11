import type { ZodType } from "zod";
import type { RedisPublisher } from "../publisher/redis.publisher.js";
import type { SentinelAlert } from "../types/sentinel.js";

export interface ProcessResult {
  accepted: string[];
  rejected: Array<{ index: number; error: string }>;
}

/**
 * Validate, normalize and publish every payload in the request body.
 * Accepts either a single JSON object or an array of them.
 */
export async function processPayload<T extends object>(
  publisher: RedisPublisher,
  body: unknown,
  schema: ZodType<T>,
  normalize: (payload: T) => SentinelAlert,
): Promise<ProcessResult> {
  const items = Array.isArray(body) ? body : [body];
  const result: ProcessResult = { accepted: [], rejected: [] };

  for (let i = 0; i < items.length; i++) {
    const parsed = schema.safeParse(items[i]);
    if (!parsed.success) {
      result.rejected.push({
        index: i,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", "),
      });
      continue;
    }

    const alert = normalize(parsed.data);
    await publisher.publish(alert);
    result.accepted.push(alert.id);
  }

  return result;
}
