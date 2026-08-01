import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        organizationId: session.organizationId,
        onHand: { gt: 0 },
      },
      include: {
        part: true,
        location: { include: { zone: true } },
        site: true,
      },
      orderBy: [{ part: { sku: "asc" } }, { location: { code: "asc" } }],
    });

    // Attach lot/serial labels
    const lotIds = balances.map((b) => b.lotId).filter(Boolean);
    const serialIds = balances.map((b) => b.serialId).filter(Boolean);
    const lots = lotIds.length
      ? await prisma.lot.findMany({ where: { id: { in: lotIds } } })
      : [];
    const serials = serialIds.length
      ? await prisma.serial.findMany({ where: { id: { in: serialIds } } })
      : [];
    const lotMap = new Map(lots.map((l) => [l.id, l]));
    const serialMap = new Map(serials.map((s) => [s.id, s]));

    const rows = balances.map((b) => ({
      ...b,
      lot: b.lotId ? lotMap.get(b.lotId) ?? null : null,
      serial: b.serialId ? serialMap.get(b.serialId) ?? null : null,
      available: b.onHand - b.reserved - b.staged,
      ledger: b.staged > 0 ? "RAW_STAGED" : "RAW",
    }));

    const sealedKits = await prisma.kit.count({
      where: {
        organizationId: session.organizationId,
        status: { in: ["SEALED", "RELEASED"] },
      },
    });

    return jsonOk({ balances: rows, kitLedgerCount: sealedKits });
  } catch (e) {
    return jsonError(e);
  }
}
