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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/kits" className="text-sm text-[var(--muted)] hover:text-white">
            ← Kits
          </Link>
          <h1 className="text-2xl font-bold mono mt-1">{kit.kitInstanceCode}</h1>
          <p className="text-sm text-[var(--muted)]">
            {kit.kitDefinition.name} · {kit.demand?.type} / {kit.demand?.externalRef}
          </p>
        </div>
        <StatusBadge status={kit.status} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Staging & DNA
          </div>
          <div className="text-sm">
            Cell:{" "}
            <span className="mono text-sky-200">
              {kit.stagingLocation?.code ?? "unassigned"}
            </span>
          </div>
          <div className="text-sm">
            Method DNA:{" "}
            <span className="mono">v{kit.dnaVersion.version}</span>
          </div>
          <div className="text-xs text-[var(--muted)] mono break-all">
            hash {kit.dnaVersion.contentHash.slice(0, 16)}…
          </div>
        </div>
        <div className="card p-4 space-y-2 md:col-span-2">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Kit Seal
          </div>
          {kit.sealFingerprint ? (
            <>
              <div className="text-xl font-bold text-violet-300 mono">
                {kit.sealFingerprint.slice(0, 12).toUpperCase()}
              </div>
              <div className="text-xs mono break-all text-[var(--muted)]">
                {kit.sealFingerprint}
              </div>
              <div className="text-xs text-[var(--muted)]">
                Sealed {kit.sealedAt?.toISOString()}
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">
              Not sealed. Stage all lines, then run validate & seal.
            </div>
          )}
        </div>
      </div>

      <KitActions kitId={kit.id} status={kit.status} />

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] font-semibold">
          BOM lines
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
                <td className="mono">{l.part.sku}</td>
                <td>{l.part.name}</td>
                <td className="mono text-xs">{l.part.tracking}</td>
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
        <div className="card p-4">
          <div className="font-semibold mb-3">Documents</div>
          {kit.documents.length === 0 && (
            <div className="text-sm text-[var(--muted)]">No documents yet.</div>
          )}
          <ul className="space-y-3">
            {kit.documents.map((d) => (
              <li key={d.id} className="border border-[var(--border)] rounded-lg p-3">
                <div className="text-xs text-[var(--muted)] mb-1">
                  {d.type} · {d.createdAt.toISOString()}
                </div>
                <pre className="text-xs mono whitespace-pre-wrap text-sky-100/90">
                  {d.content}
                </pre>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="font-semibold mb-3">Ledger activity</div>
          <ul className="space-y-2 max-h-[420px] overflow-auto">
            {kit.transactions.map((t) => (
              <li
                key={t.id}
                className="text-xs border-b border-[var(--border)] pb-2 mono"
              >
                <span className="text-amber-200">{t.type}</span>{" "}
                {t.part.sku} qty {t.qty}
                {t.lot ? ` lot ${t.lot.lotNumber}` : ""}
                {t.serial ? ` sn ${t.serial.serialNumber}` : ""}
                <div className="text-[var(--muted)]">{t.createdAt.toISOString()}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
