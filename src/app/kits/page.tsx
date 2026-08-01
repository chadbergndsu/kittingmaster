import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { CreateKitForm } from "./CreateKitForm";

export const dynamic = "force-dynamic";

export default async function KitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [kits, definitions, sites] = await Promise.all([
    prisma.kit.findMany({
      where: { organizationId: session.organizationId },
      include: {
        kitDefinition: true,
        demand: true,
        lines: true,
        dnaVersion: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.kitDefinition.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { code: "asc" },
    }),
    prisma.site.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kits</h1>
        <p className="text-sm text-[var(--muted)]">
          Unified engine for assembly jobs and fulfillment orders. Each kit binds
          to an immutable Method DNA version at creation.
        </p>
      </div>

      <CreateKitForm
        sites={sites.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
        definitions={definitions.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
        }))}
      />

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Kit</th>
              <th>Type</th>
              <th>Progress</th>
              <th>Status</th>
              <th>DNA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {kits.map((k) => {
              const staged = k.lines.reduce((a, l) => a + l.stagedQty, 0);
              const required = k.lines.reduce((a, l) => a + l.requiredQty, 0);
              return (
                <tr key={k.id}>
                  <td>
                    <div className="mono font-medium">{k.kitInstanceCode}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {k.kitDefinition.name}
                    </div>
                  </td>
                  <td className="text-sm">
                    {k.demand?.type}
                    <div className="text-xs text-[var(--muted)] mono">
                      {k.demand?.externalRef}
                    </div>
                  </td>
                  <td className="mono text-sm">
                    {staged}/{required}
                  </td>
                  <td>
                    <StatusBadge status={k.status} />
                  </td>
                  <td className="mono text-xs">v{k.dnaVersion.version}</td>
                  <td>
                    <Link className="btn" href={`/kits/${k.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
