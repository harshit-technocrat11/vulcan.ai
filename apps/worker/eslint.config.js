import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    settings: {
      turbo: {
        env: ["REDIS_URL", "REDIS_QUEUE", "WORKER_CONCURRENCY"],
      },
    },
  },
];
