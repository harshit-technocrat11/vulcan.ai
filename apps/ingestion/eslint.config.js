import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    settings: {
      turbo: {
        env: ["PORT", "HOST", "REDIS_URL", "REDIS_QUEUE", "INGEST_TOKEN"],
      },
    },
  },
];
