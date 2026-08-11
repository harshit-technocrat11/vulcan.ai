// Prisma 7 CLI configuration (https://pris.ly/d/config-datasource).
//
// The runtime connection URLs are no longer declared in schema.prisma.
// DATABASE_URL is what Prisma Migrate / db push use; DIRECT_URL is the
// Supabase "direct" connection used by `prisma migrate` because the
// transaction pooler is incompatible with Prisma Migrate.
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

loadEnv({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
    directUrl: process.env.DIRECT_URL!,
  },
});
