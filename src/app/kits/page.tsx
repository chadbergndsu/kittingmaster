import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
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
    <div>
      <PageHeader
        kicker="Operations · Kits"
        title="Kit demand engine"
        subtitle="Unified assembly and fulfillment kits. Each instance binds an immutable Method DNA version at creation."
      />

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="font-semibold">Create kit demand</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Allocates RAW stock via FEFO / nearest bin strategy
            </div>
          </div>
        </div>
        <div className="card-body">
          <CreateKitForm
            sites={sites.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
            definitions={definitions.map((d) => ({
              id: d.id,
              code: d.code,
              name: d.name,
            }))}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="font-semibold">All kits</div>
          <span className="badge mono">{kits.length} total</span>
        </div>
        <div className="overflow-x-auto">
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
                const required = k.lines.reduce((a, l) => a + l.requiredQty, 0) || 1;
                const pct = Math.min(100, Math.round((staged / required) * 100));
                return (
                  <tr key={k.id}>
                    <td>
                      <div className="mono font-semibold text-sky-200/90">{k.kitInstanceCode}</div>
                      <div className="text-xs text-[var(--muted)]">{k.kitDefinition.name}</div>
                    </td>
                    <td className="text-sm">
                      {k.demand?.type === "ASSEMBLY_JOB" ? "Assembly" : "Fulfillment"}
                      <div className="text-xs text-[var(--muted)] mono">
                        {k.demand?.externalRef}
                      </div>
                    </td>
                    <td className="min-w-[130px]">
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
                    <td className="mono text-xs text-violet-200/90">v{k.dnaVersion.version}</td>
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
    </div>
  );
}
