import { prisma } from "../client.js";
import type { AlertStatus, Prisma } from "../generated/prisma/client.js";

export interface CreateAlertInput {
  sourceId: string;
  source: string;
  severity: number;
  title: string;
  description: string;
  timestamp: Date;
  hostName?: string | null;
  hostIp?: string | null;
  observables: Prisma.InputJsonValue;
  raw: Prisma.InputJsonValue;
}

/**
 * Persistence for normalized alerts. Idempotent-aware: `upsertBySourceId`
 * makes re-delivered BullMQ jobs safe to retry without duplicating rows.
 */
export class AlertRepository {
  async createAlert(input: CreateAlertInput) {
    return prisma.alert.create({ data: input });
  }

  /** Create the alert, or no-op if the same sourceId already exists. */
  async upsertBySourceId(input: CreateAlertInput) {
    return prisma.alert.upsert({
      where: { sourceId: input.sourceId },
      create: input,
      update: {},
    });
  }

  async findById(id: string) {
    return prisma.alert.findUnique({
      where: { id },
      include: { threatIntel: true, incident: true },
    });
  }

  async findBySourceId(sourceId: string) {
    return prisma.alert.findUnique({ where: { sourceId } });
  }

  /** Recent alerts within a time window (for similarity correlation). */
  async findRecent(windowStart: Date, take = 50) {
    return prisma.alert.findMany({
      where: { timestamp: { gte: windowStart } },
      orderBy: { timestamp: "desc" },
      take,
    });
  }

  async setStatus(id: string, status: AlertStatus) {
    return prisma.alert.update({ where: { id }, data: { status } });
  }

  /** Attach an alert to an incident and mark it correlated. */
  async attachToIncident(alertId: string, incidentId: string) {
    return prisma.alert.update({
      where: { id: alertId },
      data: { incidentId, status: "CORRELATED" },
    });
  }
}
