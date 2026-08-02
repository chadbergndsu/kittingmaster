import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptForm } from "./ReceiptForm";
import { CycleCountForm } from "./CycleCountForm";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [balances, parts, sites, locations] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: { organizationId: session.organizationId, onHand: { gt: 0 } },
      include: {
        part: true,
        location: { include: { zone: true } },
        site: true,
      },
      orderBy: [{ part: { sku: "asc" } }],
    }),
    prisma.part.findMany({
      where: { organizationId: session.organizationId, isActive: true },
      orderBy: { sku: "asc" },
    }),
    prisma.site.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { code: "asc" },
    }),
    prisma.location.findMany({
      where: {
        zone: { site: { organizationId: session.organizationId } },
        type: { in: ["BIN", "CART", "TOTE"] },
      },
      include: { zone: { include: { site: true } } },
      orderBy: { code: "asc" },
    }),
  ]);

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

  const stagedRows = balances.filter((b) => b.staged > 0).length;
  const totalOnHand = balances.reduce((a, b) => a + b.onHand, 0);

  return (
    <div>
      <PageHeader
        kicker="System · Dual ledger"
        title="Inventory control"
        subtitle="Post receipts into RAW, track reserved/staged holds, and monitor sealed KIT instances."
      />

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(56,189,248,0.4)" }} />
          <div className="stat-label">RAW balance rows</div>
          <div className="stat-value text-sky-300">{balances.length}</div>
          <div className="stat-meta">{totalOnHand.toFixed(0)} units on hand</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(251,191,36,0.4)" }} />
          <div className="stat-label">Staged holds</div>
          <div className="stat-value text-amber-300">{stagedRows}</div>
          <div className="stat-meta">Awaiting kit seal</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(167,139,250,0.45)" }} />
          <div className="stat-label">KIT ledger</div>
          <div className="stat-value text-violet-300">{sealed}</div>
          <div className="stat-meta">Sealed / released instances</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="font-semibold">Receive into RAW</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Lot/serial captured per part tracking mode
            </div>
          </div>
        </div>
        <div className="card-body">
          <ReceiptForm
            parts={parts.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              tracking: p.tracking,
            }))}
            sites={sites.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
            locations={locations.map((l) => ({
              id: l.id,
              code: l.code,
              barcode: l.barcode,
              type: l.type,
              zone: {
                code: l.zone.code,
                site: { id: l.zone.site.id, code: l.zone.site.code },
              },
            }))}
          />
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="font-semibold">Cycle count (adjust)</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              WMS best practice: count → set on-hand; blocked if count &lt; reserved+staged
            </div>
          </div>
        </div>
        <div className="card-body">
          <CycleCountForm
            parts={parts.map((p) => ({ id: p.id, sku: p.sku }))}
            sites={sites.map((s) => ({ id: s.id, code: s.code }))}
            locations={locations.map((l) => ({
              id: l.id,
              code: l.code,
              zone: {
                code: l.zone.code,
                site: { id: l.zone.site.id, code: l.zone.site.code },
              },
            }))}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="font-semibold">RAW ledger positions</div>
        </div>
        <div className="overflow-x-auto">
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
                    <div className="mono font-semibold text-sky-200/90">{b.part.sku}</div>
                    <div className="text-xs text-[var(--muted)]">{b.part.name}</div>
                  </td>
                  <td className="text-sm">
                    {b.site.code}
                    <div className="mono text-xs text-[var(--muted)]">
                      {b.location.zone.code}/{b.location.code}
                    </div>
                  </td>
                  <td className="mono text-xs">
                    {b.lotId ? lotMap.get(b.lotId)?.lotNumber ?? "—" : "—"}
                    <div className="text-[var(--muted)]">
                      {b.serialId
                        ? serialMap.get(b.serialId)?.serialNumber ?? ""
                        : ""}
                    </div>
                  </td>
                  <td className="mono">{b.onHand}</td>
                  <td className="mono">{b.reserved}</td>
                  <td className="mono text-amber-200">{b.staged}</td>
                  <td className="mono text-emerald-300 font-semibold">
                    {b.onHand - b.reserved - b.staged}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
