import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeShortages, feefoRiskLots } from "@/lib/ops/shortages";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ExceptionActions } from "./ExceptionActions";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const orgId = session.organizationId;

  const [exceptionKits, balances, kitLines, lots, lotBalances] = await Promise.all([
    prisma.kit.findMany({
      where: { organizationId: orgId, status: "EXCEPTION" },
      include: { kitDefinition: true, demand: true },
      orderBy: { exceptionAt: "desc" },
    }),
    prisma.inventoryBalance.findMany({
      where: { organizationId: orgId },
      select: { partId: true, onHand: true, reserved: true, staged: true },
    }),
    prisma.kitLine.findMany({
      where: { kit: { organizationId: orgId } },
      include: { part: true, kit: { include: { demand: true } } },
    }),
    prisma.lot.findMany({
      where: { organizationId: orgId },
      include: { part: true },
    }),
    prisma.inventoryBalance.findMany({
      where: { organizationId: orgId, lotId: { not: "" } },
    }),
  ]);

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
    }))
  ).filter((s) => s.shortBy > 0);

  const expiryRisk = feefoRiskLots(
    lots.map((l) => ({
      lotNumber: l.lotNumber,
      partSku: l.part.sku,
      expiresAt: l.expiresAt,
      qty: lotQty.get(l.id) || 0,
    }))
  );

  return (
    <div>
      <PageHeader
        kicker="Operations · Exceptions & shortages"
        title="Blockers and material risk"
        subtitle="Industry research consistently flags shortages as the top kit delay driver. This board surfaces component shortfalls, FEFO expiry risk, and supervisor exception handling."
      />

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <div className="stat-label">Open exceptions</div>
          <div className="stat-value text-rose-300">{exceptionKits.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical shortages</div>
          <div className="stat-value text-amber-300">{shortages.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Lots expiring ≤30d</div>
          <div className="stat-value text-violet-300">{expiryRisk.length}</div>
        </div>
      </div>

      <div className="card mb-6 overflow-hidden">
        <div className="card-header">
          <div className="font-semibold">Component shortages</div>
          <span className="badge">open demand vs available RAW</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Available</th>
              <th>Open demand</th>
              <th>Short by</th>
              <th>Blocking kits</th>
            </tr>
          </thead>
          <tbody>
            {shortages.map((s) => (
              <tr key={s.partId}>
                <td>
                  <div className="mono font-semibold text-sky-200">{s.sku}</div>
                  <div className="text-xs text-[var(--muted)]">{s.partName}</div>
                </td>
                <td className="mono">{s.available}</td>
                <td className="mono">{s.openDemand}</td>
                <td className="mono text-rose-300 font-bold">{s.shortBy}</td>
                <td className="text-xs mono">
                  {s.blockingKits.slice(0, 4).map((k) => (
                    <div key={k.kitId}>
                      <Link className="link-accent" href={`/kits/${k.kitId}`}>
                        {k.kitInstanceCode}
                      </Link>{" "}
                      need {k.need}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {shortages.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-[var(--muted)] py-6">
                  No critical shortages — RAW covers open demand
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="font-semibold">Kit exceptions</div>
          </div>
          <div className="card-body space-y-3">
            {exceptionKits.length === 0 && (
              <div className="text-sm text-[var(--muted)]">No kits in EXCEPTION</div>
            )}
            {exceptionKits.map((k) => (
              <div
                key={k.id}
                className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 space-y-2"
              >
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <Link className="mono link-accent font-semibold" href={`/kits/${k.id}`}>
                      {k.kitInstanceCode}
                    </Link>
                    <div className="text-xs text-[var(--muted)]">{k.kitDefinition.name}</div>
                  </div>
                  <StatusBadge status={k.status} />
                </div>
                <div className="text-sm text-rose-100/90">{k.exceptionReason}</div>
                <ExceptionActions kitId={k.id} />
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="font-semibold">FEFO expiry risk</div>
            <span className="badge">≤ 30 days</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Part</th>
                <th>Days left</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {expiryRisk.map((l) => (
                <tr key={`${l.partSku}-${l.lotNumber}`}>
                  <td className="mono text-xs">{l.lotNumber}</td>
                  <td className="mono">{l.partSku}</td>
                  <td
                    className={`mono font-bold ${
                      l.daysLeft <= 7 ? "text-rose-300" : "text-amber-300"
                    }`}
                  >
                    {l.daysLeft}
                  </td>
                  <td className="mono">{l.qty}</td>
                </tr>
              ))}
              {expiryRisk.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-[var(--muted)] py-6">
                    No near-term expiry risk
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
