import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const balances = await prisma.inventoryBalance.findMany({
    where: { organizationId: session.organizationId, onHand: { gt: 0 } },
    include: {
      part: true,
      location: { include: { zone: true } },
      site: true,
    },
    orderBy: [{ part: { sku: "asc" } }],
  });

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

  const sealed = await prisma.kit.count({
    where: {
      organizationId: session.organizationId,
      status: { in: ["SEALED", "RELEASED"] },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dual-ledger inventory</h1>
        <p className="text-sm text-[var(--muted)]">
          RAW component stock by location (with lot/serial). Sealed kits live on the KIT
          ledger ({sealed} sealed/released instances).
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] uppercase">RAW balance rows</div>
          <div className="text-2xl font-bold mono">{balances.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] uppercase">Staged holds</div>
          <div className="text-2xl font-bold mono text-amber-300">
            {balances.filter((b) => b.staged > 0).length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] uppercase">KIT ledger</div>
          <div className="text-2xl font-bold mono text-violet-300">{sealed}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Site / Location</th>
              <th>Lot / Serial</th>
              <th>On hand</th>
              <th>Reserved</th>
              <th>Staged</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="mono">{b.part.sku}</div>
                  <div className="text-xs text-[var(--muted)]">{b.part.name}</div>
                </td>
                <td className="text-sm">
                  {b.site.code}
                  <div className="mono text-xs text-[var(--muted)]">
                    {b.location.zone.code}/{b.location.code}
                  </div>
                </td>
                <td className="mono text-xs">
                  {b.lotId ? lotMap.get(b.lotId)?.lotNumber ?? b.lotId.slice(0, 8) : "—"}
                  <div>
                    {b.serialId
                      ? serialMap.get(b.serialId)?.serialNumber ?? b.serialId.slice(0, 8)
                      : ""}
                  </div>
                </td>
                <td className="mono">{b.onHand}</td>
                <td className="mono">{b.reserved}</td>
                <td className="mono text-amber-200">{b.staged}</td>
                <td className="mono text-emerald-300">
                  {b.onHand - b.reserved - b.staged}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
