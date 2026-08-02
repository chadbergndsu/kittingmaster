import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeShortages, feefoRiskLots } from "@/lib/ops/shortages";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const orgId = session.organizationId;

    const [balances, kitLines, lots] = await Promise.all([
      prisma.inventoryBalance.findMany({
        where: { organizationId: orgId },
        select: { partId: true, onHand: true, reserved: true, staged: true },
      }),
      prisma.kitLine.findMany({
        where: { kit: { organizationId: orgId } },
        include: {
          part: true,
          kit: { include: { demand: true } },
        },
      }),
      prisma.lot.findMany({
        where: { organizationId: orgId },
        include: { part: true },
      }),
    ]);

    // qty per lot from balances
    const lotBalances = await prisma.inventoryBalance.findMany({
      where: { organizationId: orgId, lotId: { not: "" } },
    });
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
