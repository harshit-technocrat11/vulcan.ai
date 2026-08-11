import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    settings: {
      turbo: {
        env: ["DATABASE_URL", "DIRECT_URL"],
      },
    },
  },
];
