/**
 * Ops KPIs — market WMS kitting dashboards track throughput, aging, seal rate.
 */

export type KitMetricInput = {
  id: string;
  status: string;
  createdAt: Date;
  sealedAt: Date | null;
  updatedAt: Date;
  demandType?: string | null;
  priority?: number | null;
  dueAt?: Date | null;
};

export type OpsMetrics = {
  totalKits: number;
  sealedToday: number;
  releasedToday: number;
  inFlight: number;
  exceptions: number;
  avgStageMinutes: number | null;
  sealRatePct: number;
  overdue: number;
  agingOver4h: number;
  byDemandType: Record<string, number>;
  throughputLast24h: number;
};

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function computeOpsMetrics(kits: KitMetricInput[], now = new Date()): OpsMetrics {
  const dayStart = startOfUtcDay(now);
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const fourH = 4 * 3600 * 1000;

  const terminal = new Set(["SEALED", "RELEASED", "CANCELLED"]);
  const inFlightStatuses = new Set([
    "PENDING",
    "ALLOCATED",
    "PICKING",
    "STAGED",
    "VALIDATING",
  ]);

  let sealedToday = 0;
  let releasedToday = 0;
  let exceptions = 0;
  let overdue = 0;
  let agingOver4h = 0;
  let stageMinutesSum = 0;
  let stageCount = 0;
  let sealedOrReleased = 0;
  let throughputLast24h = 0;
  const byDemandType: Record<string, number> = {};

  for (const k of kits) {
    byDemandType[k.demandType || "UNKNOWN"] =
      (byDemandType[k.demandType || "UNKNOWN"] || 0) + 1;

    if (k.status === "EXCEPTION") exceptions++;
    if (k.status === "SEALED" || k.status === "RELEASED") sealedOrReleased++;
    if (k.sealedAt && k.sealedAt >= dayStart) sealedToday++;
    if (k.status === "RELEASED" && k.updatedAt >= dayStart) releasedToday++;
    if (k.sealedAt && k.sealedAt >= dayAgo) throughputLast24h++;

    if (inFlightStatuses.has(k.status) && now.getTime() - k.createdAt.getTime() > fourH) {
      agingOver4h++;
    }
    if (
      k.dueAt &&
      k.dueAt < now &&
      !terminal.has(k.status)
    ) {
      overdue++;
    }
    if (k.sealedAt) {
      const mins = (k.sealedAt.getTime() - k.createdAt.getTime()) / 60000;
      if (mins >= 0 && mins < 60 * 24 * 14) {
        stageMinutesSum += mins;
        stageCount++;
      }
    }
  }

  const inFlight = kits.filter((k) => inFlightStatuses.has(k.status)).length;
  const total = kits.length || 1;

  return {
    totalKits: kits.length,
    sealedToday,
    releasedToday,
    inFlight,
    exceptions,
    avgStageMinutes: stageCount ? Math.round(stageMinutesSum / stageCount) : null,
    sealRatePct: Math.round((sealedOrReleased / total) * 1000) / 10,
    overdue,
    agingOver4h,
    byDemandType,
    throughputLast24h,
  };
}
