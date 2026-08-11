/**
 * Manual verification: enqueue a sample Sentinel alert onto the `alert.enrich`
 * queue so the worker picks it up, enriches it and correlates it.
 *
 * Run with: pnpm --filter worker run demo
 */
import { Queue } from "bullmq";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import type { SentinelAlert } from "../src/types/sentinel.js";

loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const queueName = process.env.REDIS_QUEUE ?? "alert.enrich";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const alerts: SentinelAlert[] = [
  {
    id: "demo_wazuh_ssh_001",
    source: "wazuh",
    severity: 9,
    title: "SSH Brute Force Attempt",
    description:
      "Multiple failed SSH login attempts detected from the same source IP.",
    timestamp: new Date().toISOString(),
    host: { name: "wazuh-agent", ip: "172.20.0.5" },
    observables: [
      { type: "ipv4", value: "185.220.101.42" },
      { type: "ipv4", value: "172.20.0.5" },
    ],
    raw: { rule: { id: "5710", level: 9 } },
  },
  {
    id: "demo_wazuh_ssh_002",
    source: "wazuh",
    severity: 9,
    title: "SSH Brute Force Attempt",
    description:
      "Further failed SSH login attempts from the same source IP (should correlate).",
    timestamp: new Date(Date.now() + 30_000).toISOString(),
    host: { name: "wazuh-agent", ip: "172.20.0.5" },
    observables: [{ type: "ipv4", value: "185.220.101.42" }],
    raw: { rule: { id: "5710", level: 9 } },
  },
  {
    id: "demo_suricata_001",
    source: "suricata",
    severity: 7,
    title: "ET TROJAN Suspicious Executable",
    description: "Suspicious executable download detected on the network.",
    timestamp: new Date().toISOString(),
    host: { name: "suricata", ip: "172.20.0.4" },
    observables: [
      {
        type: "hash",
        value: "44d88612fea8a8f36de82e1278abb02f",
      },
    ],
    raw: { signature: "ET TROJAN Suspicious Executable" },
  },
];

async function main(): Promise<void> {
  const queue = new Queue<SentinelAlert>(queueName, {
    connection: { url: redisUrl, maxRetriesPerRequest: null },
  });

  for (const alert of alerts) {
    const job = await queue.add("enrich", alert, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
    console.log(`[demo] enqueued job ${job.id} for alert ${alert.id}`);
  }

  await queue.close();
  console.log(`[demo] done - watch the worker (pnpm --filter worker run dev)`);
}

main().catch((err) => {
  console.error("[demo] failed:", err);
  process.exit(1);
});
