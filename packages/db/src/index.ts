// @repo/db - single source of truth for database access.
//
// Exports the PrismaClient singleton, the generated types (models + enums +
// Prisma namespace), and the repository classes used by apps/api and
// apps/worker.

export { prisma } from "./client.js";
export { AlertRepository } from "./repositories/alert.repository.js";
export { IncidentRepository } from "./repositories/incident.repository.js";
export { ConversationRepository } from "./repositories/conversation.repository.js";

// Re-export the entire generated client (PrismaClient, model types, enums,
// Prisma namespace) so consumers only need to import from "@repo/db".
export * from "./generated/prisma/client.js";
