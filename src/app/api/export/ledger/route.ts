import { requireRole } from "@/lib/auth/session";
import { EXPORT_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { renderLedgerJournal } from "@/lib/ops/ledger-export";
import { jsonError } from "@/lib/api";

/**
 * GET /api/export/ledger
 * Newest-first cap of 5000 with X-Truncated when more exist.
 * Optional ?before=ISO for pagination cursor.
 */
export async function GET(req: Request) {
  try {
    const session = await requireRole(EXPORT_ROLES, "Insufficient role to export ledger");
    const url = new URL(req.url);
    const before = url.searchParams.get("before");
    const take = 5000;

    const where = {
      organizationId: session.organizationId,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    };

    const [org, total, txns] = await Promise.all([
      prisma.organization.findUnique({ where: { id: session.organizationId } }),
      prisma.inventoryTransaction.count({ where: { organizationId: session.organizationId } }),
      prisma.inventoryTransaction.findMany({
        where,
        include: {
          part: true,
          lot: true,
          serial: true,
          kit: true,
          fromLocation: true,
          toLocation: true,
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
    ]);

    // Journal chronological (oldest first within page)
    const ordered = [...txns].reverse();
    const truncated = total > take || (before ? txns.length === take : total > take);

    const journal = renderLedgerJournal(
      org?.slug || "org",
      ordered.map((t) => ({
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
      {
        title: truncated
          ? `Inventory journal (page of ${ordered.length}; truncated — total ${total})`
          : "Full inventory journal",
      }
    );

    const oldest = ordered[0]?.createdAt?.toISOString() ?? "";

    return new Response(journal, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="kittingmaster-ledger-${org?.slug || "org"}.journal"`,
        "X-Truncated": truncated ? "true" : "false",
        "X-Total-Count": String(total),
        "X-Page-Count": String(ordered.length),
        ...(oldest ? { "X-Next-Before": oldest } : {}),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
