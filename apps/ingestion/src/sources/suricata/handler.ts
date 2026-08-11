import { Router } from "express";
import type { RedisPublisher } from "../../publisher/redis.publisher.js";
import { processPayload } from "../process.js";
import { normalizeSuricata } from "../../normalizer/normalizer.js";
import { suricataAlertSchema } from "../../validators/alert.validator.js";

/**
 * Inbound webhook for Suricata. The eve.json forwarder in the mock environment
 * tails /var/log/suricata/eve.json and POSTs each alert event here.
 */
export function suricataRouter(publisher: RedisPublisher): Router {
  const router = Router();

  router.post("/webhooks/suricata", async (req, res) => {
    try {
      const result = await processPayload(
        publisher,
        req.body,
        suricataAlertSchema,
        normalizeSuricata,
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
      console.error("[suricata] failed to publish alert:", message);
      res.status(503).json({ error: "could not publish alert", message });
    }
  });

  return router;
}
