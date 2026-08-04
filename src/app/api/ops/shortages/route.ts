import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeShortages, feefoRiskLots } from "@/lib/ops/shortages";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const orgId = session.organizationId;

    const openStatuses = [
      "PENDING",
      "ALLOCATED",
      "PICKING",
      "STAGED",
      "VALIDATING",
      "EXCEPTION",
    ] as const;

    const [balances, kitLines, lots, holds, lotBalances] = await Promise.all([
      prisma.inventoryBalance.findMany({
        where: { organizationId: orgId },
        select: { partId: true, onHand: true, reserved: true, staged: true },
        take: 20000,
      }),
      prisma.kitLine.findMany({
        where: {
          kit: { organizationId: orgId, status: { in: [...openStatuses] } },
        },
        include: {
          part: true,
          kit: { include: { demand: true } },
        },
        take: 20000,
      }),
      prisma.lot.findMany({
        where: { organizationId: orgId },
        include: { part: true },
        take: 5000,
      }),
      prisma.stockHold.findMany({
        where: { organizationId: orgId },
        select: { kitLineId: true, qty: true, qtyConsumed: true },
      }),
      prisma.inventoryBalance.findMany({
        where: { organizationId: orgId, lotId: { not: "" } },
        select: { lotId: true, onHand: true },
        take: 20000,
      }),
    ]);

    const reservedByLine = new Map<string, number>();
    for (const h of holds) {
      const rem = h.qty - h.qtyConsumed;
      if (rem <= 0) continue;
      reservedByLine.set(h.kitLineId, (reservedByLine.get(h.kitLineId) || 0) + rem);
    }

    const lotQty = new Map<string, number>();
    for (const b of lotBalances) {
      if (!b.lotId) continue;
      lotQty.set(b.lotId, (lotQty.get(b.lotId) || 0) + b.onHand);
    }

    const shortages = computeShortages(
      balances,
      kitLines.map((l) => ({
        kitId: l.kitId,
        kitInstanceCode: l.kit.kitInstanceCode,
        kitStatus: l.kit.status,
        partId: l.partId,
        sku: l.part.sku,
        partName: l.part.name,
        requiredQty: l.requiredQty,
        stagedQty: l.stagedQty,
        reservedQty: reservedByLine.get(l.id) || 0,
        dueAt: l.kit.demand?.dueAt,
        priority: l.kit.demand?.priority,
      }))
    );

    const expiryRisk = feefoRiskLots(
      lots.map((l) => ({
        lotNumber: l.lotNumber,
        partSku: l.part.sku,
        expiresAt: l.expiresAt,
        qty: lotQty.get(l.id) || 0,
      }))
    );

    return jsonOk({
      shortages: shortages.filter((s) => s.shortBy > 0 || s.severity === "WARN"),
      criticalCount: shortages.filter((s) => s.severity === "CRITICAL").length,
      expiryRisk,
    });
  } catch (e) {
    return jsonError(e);
  }
}
