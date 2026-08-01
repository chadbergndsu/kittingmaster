import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [parts, defs, locations] = await Promise.all([
    prisma.part.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { sku: "asc" },
    }),
    prisma.kitDefinition.findMany({
      where: { organizationId: session.organizationId },
      include: { lines: { include: { part: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { code: "asc" },
    }),
    prisma.location.findMany({
      where: { zone: { site: { organizationId: session.organizationId } } },
      include: { zone: { include: { site: true } } },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        kicker="System · Catalog"
        title="Master data"
        subtitle="Parts, kit definitions (BOMs), and scannable locations for staging cells and bins."
      />

      <div className="card overflow-hidden mb-6">
        <div className="card-header">
          <div className="font-semibold">Parts</div>
          <span className="badge mono">{parts.length}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Tracking</th>
              <th>Barcode</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td className="mono font-semibold text-sky-200/90">{p.sku}</td>
                <td>{p.name}</td>
                <td>
                  <span className="badge mono">{p.tracking}</span>
                </td>
                <td className="mono text-xs text-[var(--muted)]">{p.barcode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {defs.map((d) => (
          <div key={d.id} className="card">
            <div className="card-header">
              <div>
                <div className="font-semibold mono">{d.code}</div>
                <div className="text-xs text-[var(--muted)]">{d.name}</div>
              </div>
              <span className="badge">rev {d.revision}</span>
            </div>
            <div className="card-body space-y-2">
              {d.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex justify-between items-center text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white/[0.015]"
                >
                  <span className="mono text-sky-200/90">{l.part.sku}</span>
                  <span className="mono text-[var(--muted)]">× {l.qty}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="font-semibold">Locations</div>
          <span className="badge mono">{locations.length}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Zone / Site</th>
              <th>Barcode</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td className="mono font-semibold">{l.code}</td>
                <td>
                  <span className="badge mono">{l.type}</span>
                </td>
                <td className="text-sm">
                  {l.zone.code} / {l.zone.site.code}
                </td>
                <td className="mono text-xs text-sky-200/90">{l.barcode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
