import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; glow: string }> = {
  PENDING: { label: "Pending", glow: "rgba(148,163,184,0.35)" },
  ALLOCATED: { label: "Allocated", glow: "rgba(56,189,248,0.4)" },
  PICKING: { label: "Picking", glow: "rgba(251,191,36,0.4)" },
  STAGED: { label: "Staged", glow: "rgba(52,211,153,0.4)" },
  VALIDATING: { label: "Validating", glow: "rgba(192,132,252,0.4)" },
  SEALED: { label: "Sealed", glow: "rgba(167,139,250,0.45)" },
  RELEASED: { label: "Released", glow: "rgba(34,197,94,0.4)" },
  EXCEPTION: { label: "Exception", glow: "rgba(251,113,133,0.4)" },
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const kits = await prisma.kit.findMany({
    where: { organizationId: session.organizationId },
    include: {
      kitDefinition: true,
      demand: true,
      stagingLocation: true,
      lines: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const counts: Record<string, number> = {};
  for (const k of kits) {
    counts[k.status] = (counts[k.status] || 0) + 1;
  }

  const sealed = (counts.SEALED || 0) + (counts.RELEASED || 0);
  const inFlight =
    (counts.ALLOCATED || 0) +
    (counts.PICKING || 0) +
    (counts.STAGED || 0) +
    (counts.VALIDATING || 0);
  const exceptions = counts.EXCEPTION || 0;
  const assembly = kits.filter((k) => k.demand?.type === "ASSEMBLY_JOB").length;
  const fulfillment = kits.filter((k) => k.demand?.type === "FULFILLMENT_ORDER").length;

  const statusOrder = Object.keys(STATUS_META);

  return (
    <div>
      <PageHeader
        kicker="Operations · Command board"
        title="Live kit control"
        subtitle={`Real-time dual-ledger status for ${session.organizationName}. Track staging, seals, and release targets across assembly and fulfillment.`}
        actions={
          <>
            <Link href="/scan" className="btn">
              Open scan
            </Link>
            <Link href="/kits" className="btn btn-primary">
              Manage kits
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(56,189,248,0.5)" }} />
          <div className="stat-label">Active pipeline</div>
          <div className="stat-value text-sky-300">{inFlight}</div>
          <div className="stat-meta">Allocated → validating</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(167,139,250,0.5)" }} />
          <div className="stat-label">Sealed / released</div>
          <div className="stat-value text-violet-300">{sealed}</div>
          <div className="stat-meta">KIT ledger instances</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(52,211,153,0.4)" }} />
          <div className="stat-label">Demand mix</div>
          <div className="stat-value text-emerald-300">
            {assembly}
            <span className="text-base text-[var(--muted)] font-medium"> / {fulfillment}</span>
          </div>
          <div className="stat-meta">Assembly / fulfillment</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(251,113,133,0.4)" }} />
          <div className="stat-label">Exceptions</div>
          <div className="stat-value text-rose-300">{exceptions}</div>
          <div className="stat-meta">Needs supervisor attention</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="font-semibold">Status pipeline</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Kit lifecycle from demand to release
            </div>
          </div>
          <span className="badge">
            <span className="live-dot" />
            {kits.length} kits
          </span>
        </div>
        <div className="card-body">
          <div className="pipeline">
            {statusOrder.map((s) => (
              <div key={s} className={`pipeline-step status-${s}`}>
                <div className="text-[0.65rem] uppercase tracking-wider opacity-80 font-bold">
                  {STATUS_META[s].label}
                </div>
                <div className="mono text-2xl font-bold mt-1">{counts[s] || 0}</div>
                <div
                  className="bar"
                  style={{ color: STATUS_META[s].glow.replace("0.4", "1").replace("0.45", "1").replace("0.35", "1") }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <div className="font-semibold">Kit worklist</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Click an instance to inspect seal, BOM, and ledger activity
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Instance</th>
                <th>Definition</th>
                <th>Demand</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Staging</th>
                <th>Seal</th>
              </tr>
            </thead>
            <tbody>
              {kits.map((k) => {
                const staged = k.lines.reduce((a, l) => a + l.stagedQty, 0);
                const required = k.lines.reduce((a, l) => a + l.requiredQty, 0) || 1;
                const pct = Math.min(100, Math.round((staged / required) * 100));
                return (
                  <tr key={k.id}>
                    <td>
                      <Link className="link-accent mono font-semibold" href={`/kits/${k.id}`}>
                        {k.kitInstanceCode}
                      </Link>
                    </td>
                    <td>
                      <div className="font-medium text-sm">{k.kitDefinition.name}</div>
                      <div className="text-xs text-[var(--muted)] mono">{k.kitDefinition.code}</div>
                    </td>
                    <td>
                      <div className="text-sm">
                        {k.demand?.type === "ASSEMBLY_JOB" ? "Assembly" : "Fulfillment"}
                      </div>
                      <div className="text-xs text-[var(--muted)] mono">
                        {k.demand?.externalRef ?? "—"}
                      </div>
                    </td>
                    <td className="min-w-[120px]">
                      <div className="flex justify-between text-[0.7rem] mono text-[var(--muted)] mb-1">
                        <span>
                          {staged}/{required}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={k.status} />
                    </td>
                    <td className="mono text-sm text-[var(--text-secondary)]">
                      {k.stagingLocation?.code ?? "—"}
                    </td>
                    <td className="mono text-xs">
                      {k.sealFingerprint ? (
                        <span className="seal-code">{k.sealFingerprint.slice(0, 12).toUpperCase()}</span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
