import express from "express";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import type { RedisPublisher } from "./publisher/redis.publisher.js";
import { suricataRouter } from "./sources/suricata/handler.js";
import { wazuhRouter } from "./sources/wazuh/handler.js";

export function createApp(publisher: RedisPublisher): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req: Request, res: Response) => {
    const redisOk = await publisher.ping();
    res.status(redisOk ? 200 : 503).json({
      status: redisOk ? "ok" : "degraded",
      redis: redisOk ? "connected" : "unreachable",
      queue: config.redisQueue,
    });
  });

  if (config.ingestToken) {
    app.use("/webhooks", (req: Request, res: Response, next: NextFunction) => {
      if (req.headers["x-ingest-token"] !== config.ingestToken) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      next();
    });
  }

  app.use(wazuhRouter(publisher));
  app.use(suricataRouter(publisher));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });

  app.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error("[ingestion] unhandled error:", err);
      res.status(500).json({ error: "internal error" });
    },
  );

  return app;
}
