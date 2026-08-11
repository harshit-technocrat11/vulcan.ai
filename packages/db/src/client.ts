import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

/**
 * Global PrismaClient singleton.
 *
 * Prisma 7 requires a driver adapter for the runtime connection; we use the
 * `pg` adapter with the application `DATABASE_URL`. (Schema migrations use
 * `DIRECT_URL` via prisma.config.ts - the Supabase transaction pooler is not
 * compatible with Prisma Migrate.)
 *
 * The `globalThis` cache prevents connection exhaustion when the module is
 * re-evaluated by tsx watch or a hot-reloading dev server.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
