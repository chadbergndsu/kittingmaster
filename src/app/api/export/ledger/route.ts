import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { renderLedgerJournal } from "@/lib/ops/ledger-export";
import { jsonError } from "@/lib/api";

/**
 * GET /api/export/ledger
 * Plain-text dual-entry journal (ledger-cli compatible) for customer ownership/audit.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const [org, txns] = await Promise.all([
      prisma.organization.findUnique({ where: { id: session.organizationId } }),
      prisma.inventoryTransaction.findMany({
        where: { organizationId: session.organizationId },
        include: {
          part: true,
          lot: true,
          serial: true,
          kit: true,
          fromLocation: true,
          toLocation: true,
        },
        orderBy: { createdAt: "asc" },
        take: 5000,
      }),
    ]);

    const journal = renderLedgerJournal(
      org?.slug || "org",
      txns.map((t) => ({
        createdAt: t.createdAt,
        type: t.type,
        kitCode: t.kit?.kitInstanceCode,
        partSku: t.part.sku,
        qty: t.qty,
        fromLocation: t.fromLocation?.code,
        toLocation: t.toLocation?.code,
        lot: t.lot?.lotNumber,
        serial: t.serial?.serialNumber,
      })),
      { title: "Full inventory journal (capped 5000 txns)" }
    );

    return new Response(journal, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="kittingmaster-ledger-${org?.slug || "org"}.journal"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
