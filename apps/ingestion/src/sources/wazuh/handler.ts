import { Router } from "express";
import type { RedisPublisher } from "../../publisher/redis.publisher.js";
import { processPayload } from "../process.js";
import { normalizeWazuh } from "../../normalizer/normalizer.js";
import { wazuhAlertSchema } from "../../validators/alert.validator.js";

/**
 * Inbound webhook for Wazuh. The Wazuh manager's custom-remote integration
 * POSTs the full alert JSON here.
 */
export function wazuhRouter(publisher: RedisPublisher): Router {
  const router = Router();

  router.post("/webhooks/wazuh", async (req, res) => {
    try {
      const result = await processPayload(
        publisher,
        req.body,
        wazuhAlertSchema,
        normalizeWazuh,
      );

      if (result.accepted.length === 0) {
        res.status(400).json({ error: "no valid alerts", result });
        return;
      }

      res.status(200).json({
        accepted: result.accepted.length,
        rejected: result.rejected,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[wazuh] failed to publish alert:", message);
      res.status(503).json({ error: "could not publish alert", message });
    }
  });

  return router;
}
