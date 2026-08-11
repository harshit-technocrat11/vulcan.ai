import { prisma } from "../client.js";
import type { IncidentStatus, Prisma } from "../generated/prisma/client.js";

export interface CreateIncidentInput {
  title: string;
  severity: number;
  correlationKeys: Prisma.InputJsonValue;
}

/** Persistence for correlated alerts grouped into incidents. */
export class IncidentRepository {
  async createIncident(input: CreateIncidentInput) {
    return prisma.incident.create({ data: input });
  }

  async findById(id: string) {
    return prisma.incident.findUnique({
      where: { id },
      include: { alerts: true, investigation: true },
    });
  }

  async listByStatus(status: IncidentStatus, take = 100) {
    return prisma.incident.findMany({
      where: { status },
      orderBy: { updatedAt: "desc" },
      take,
    });
  }

  /** Recompute the incident severity as the max severity of its alerts. */
  async refreshSeverity(id: string) {
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: { alerts: { select: { severity: true } } },
    });
    if (!incident) return null;

    const maxSeverity = incident.alerts.reduce(
      (max, alert) => Math.max(max, alert.severity),
      0,
    );
    return prisma.incident.update({
      where: { id },
      data: { severity: maxSeverity },
    });
  }

  async setStatus(id: string, status: IncidentStatus) {
    return prisma.incident.update({ where: { id }, data: { status } });
  }
}
