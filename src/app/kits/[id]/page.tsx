import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { KitActions } from "./KitActions";

export const dynamic = "force-dynamic";

export default async function KitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const kit = await prisma.kit.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      kitDefinition: true,
      demand: true,
      stagingLocation: true,
      lines: { include: { part: true }, orderBy: { part: { sku: "asc" } } },
      dnaVersion: true,
      documents: { orderBy: { createdAt: "desc" } },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { part: true, lot: true, serial: true },
      },
    },
  });
  if (!kit) notFound();

  const staged = kit.lines.reduce((a, l) => a + l.stagedQty, 0);
  const required = kit.lines.reduce((a, l) => a + l.requiredQty, 0) || 1;
  const pct = Math.min(100, Math.round((staged / required) * 100));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/kits" className="text-sm text-[var(--muted)] hover:text-white">
            ← Back to kits
          </Link>
          <div className="page-kicker mt-3">Kit instance</div>
          <h1 className="page-title mono">{kit.kitInstanceCode}</h1>
          <p className="page-subtitle">
            {kit.kitDefinition.name} ·{" "}
            {kit.demand?.type === "ASSEMBLY_JOB" ? "Assembly" : "Fulfillment"} /{" "}
            <span className="mono">{kit.demand?.externalRef}</span>
          </p>
        </div>
        <StatusBadge status={kit.status} />
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="stat-label">Completeness</div>
          <div className="stat-value text-sky-300">{pct}%</div>
          <div className="progress-track mt-3">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="stat-meta">
            {staged}/{required} units staged
          </div>
        </div>
        <div className="stat-card md:col-span-1">
          <div className="stat-label">Staging cell</div>
          <div className="stat-value !text-lg mt-2 mono text-emerald-300">
            {kit.stagingLocation?.code ?? "—"}
          </div>
          <div className="stat-meta mono">{kit.stagingLocation?.barcode ?? "unassigned"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Method DNA</div>
          <div className="stat-value !text-lg mt-2 text-violet-300">
            v{kit.dnaVersion.version}
          </div>
          <div className="stat-meta mono">{kit.dnaVersion.contentHash.slice(0, 12)}…</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Kit Seal</div>
          {kit.sealFingerprint ? (
            <>
              <div className="seal-code text-xl mt-2">
                {kit.sealFingerprint.slice(0, 12).toUpperCase()}
              </div>
              <div className="stat-meta">Sealed {kit.sealedAt?.toISOString().slice(0, 19)}Z</div>
            </>
          ) : (
            <>
              <div className="stat-value !text-lg mt-2 text-[var(--muted)]">Not sealed</div>
              <div className="stat-meta">Stage all lines, then seal</div>
            </>
          )}
        </div>
      </div>

      {kit.sealFingerprint && (
        <div className="card">
          <div className="card-body">
            <div className="field-label">Full seal fingerprint</div>
            <div className="mono text-xs text-violet-200/80 break-all leading-relaxed">
              {kit.sealFingerprint}
            </div>
          </div>
        </div>
      )}

      <KitActions kitId={kit.id} status={kit.status} />

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="font-semibold">BOM lines</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Part</th>
              <th>Tracking</th>
              <th>Required</th>
              <th>Staged</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {kit.lines.map((l) => (
              <tr key={l.id}>
                <td className="mono font-semibold text-sky-200/90">{l.part.sku}</td>
                <td>{l.part.name}</td>
                <td>
                  <span className="badge mono">{l.part.tracking}</span>
                </td>
                <td className="mono">{l.requiredQty}</td>
                <td className="mono">{l.stagedQty}</td>
                <td>
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <div className="font-semibold">Documents</div>
          </div>
          <div className="card-body space-y-3">
            {kit.documents.length === 0 && (
              <div className="text-sm text-[var(--muted)]">No documents yet.</div>
            )}
            {kit.documents.map((d) => (
              <div key={d.id} className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
                <div className="flex justify-between gap-2 text-xs text-[var(--muted)] mb-2">
                  <span className="badge">{d.type}</span>
                  <span className="mono">{d.createdAt.toISOString()}</span>
                </div>
                <pre className="text-xs mono whitespace-pre-wrap text-sky-100/85 leading-relaxed">
                  {d.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="font-semibold">Ledger activity</div>
          </div>
          <div className="card-body max-h-[480px] overflow-auto space-y-2">
            {kit.transactions.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs mono bg-white/[0.015]"
              >
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  <span className="text-amber-200 font-bold">{t.type}</span>
                  <span className="text-sky-200">{t.part.sku}</span>
                  <span>qty {t.qty}</span>
                  {t.lot && <span className="text-[var(--muted)]">lot {t.lot.lotNumber}</span>}
                  {t.serial && (
                    <span className="text-[var(--muted)]">sn {t.serial.serialNumber}</span>
                  )}
                </div>
                <div className="text-[var(--muted)] mt-1">{t.createdAt.toISOString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
