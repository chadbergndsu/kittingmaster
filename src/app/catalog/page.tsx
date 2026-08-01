import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catalog</h1>
        <p className="text-sm text-[var(--muted)]">
          Parts, kit definitions (BOMs), and scannable locations.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] font-semibold">Parts</div>
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
                <td className="mono">{p.sku}</td>
                <td>{p.name}</td>
                <td className="mono text-xs">{p.tracking}</td>
                <td className="mono text-xs">{p.barcode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {defs.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="font-semibold">
              {d.code}{" "}
              <span className="text-[var(--muted)] font-normal">rev {d.revision}</span>
            </div>
            <div className="text-sm text-[var(--muted)] mb-3">{d.name}</div>
            <ul className="space-y-1 text-sm">
              {d.lines.map((l) => (
                <li key={l.id} className="flex justify-between mono">
                  <span>{l.part.sku}</span>
                  <span>× {l.qty}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] font-semibold">
          Locations
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
                <td className="mono">{l.code}</td>
                <td className="mono text-xs">{l.type}</td>
                <td className="text-sm">
                  {l.zone.code} / {l.zone.site.code}
                </td>
                <td className="mono text-xs text-sky-200">{l.barcode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
