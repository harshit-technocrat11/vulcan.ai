import { createApp } from "./app.js";
import { config } from "./config.js";
import { RedisPublisher } from "./publisher/redis.publisher.js";

async function main(): Promise<void> {
  const publisher = new RedisPublisher(config.redisQueue, config.redisUrl);

  const app = createApp(publisher);

  const server = app.listen(config.port, config.host, () => {
    console.log(`[ingestion] listening on http://${config.host}:${config.port}`);
    console.log(
      `[ingestion] publishing normalized alerts to Redis queue "${config.redisQueue}"`,
    );
  });

  const shutdown = async () => {
    console.log("[ingestion] shutting down...");
    server.close(async () => {
      await publisher.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[ingestion] fatal error:", err);
  process.exit(1);
});
