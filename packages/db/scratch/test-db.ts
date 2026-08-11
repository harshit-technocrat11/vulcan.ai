/**
 * Manual connection check: performs a Create + Read against Supabase.
 * Requires DATABASE_URL to be set in the workspace root .env.
 *
 * Run with: pnpm --filter @repo/db run demo
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

// Dynamic import: client.ts reads DATABASE_URL at module evaluation time, so
// it must run after the env above is loaded (ESM hoists static imports).
const { prisma } = await import("../src/client.js");

async function main(): Promise<void> {
  // Idempotent Create + Read on the User model.
  const user = await prisma.user.upsert({
    where: { email: "test@sentinel.local" },
    create: { email: "test@sentinel.local", name: "Sentinel Test User" },
    update: { name: "Sentinel Test User" },
  });
  console.log("db ok - user id:", user.id);
  console.log("db ok - user email:", user.email);

  const count = await prisma.message.count();
  console.log("db ok - message count:", count);
}

main()
  .catch((err) => {
    console.error("db connection failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
