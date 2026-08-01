import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const kits = await prisma.kit.findMany({
    where: { organizationId: session.organizationId },
    include: { kitDefinition: true, demand: true, stagingLocation: true },
    orderBy: { updatedAt: "desc" },
  });

  const counts: Record<string, number> = {};
  for (const k of kits) {
    counts[k.status] = (counts[k.status] || 0) + 1;
  }

  const statusOrder = [
    "PENDING",
    "ALLOCATED",
    "PICKING",
    "STAGED",
    "VALIDATING",
    "SEALED",
    "RELEASED",
    "EXCEPTION",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live kit board</h1>
          <p className="text-sm text-[var(--muted)]">
            Real-time status across assembly and fulfillment demands for{" "}
            {session.organizationName}.
          </p>
        </div>
        <Link href="/kits" className="btn btn-primary">
          Manage kits
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {statusOrder.map((s) => (
          <div key={s} className="card p-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {s}
            </div>
            <div className={`text-2xl font-bold mono status-${s}`}>
              {counts[s] || 0}
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between">
          <div className="font-semibold">Kits</div>
          <div className="text-xs text-[var(--muted)]">{kits.length} total</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Instance</th>
                <th>Definition</th>
                <th>Demand</th>
                <th>Status</th>
                <th>Staging</th>
                <th>Seal</th>
              </tr>
            </thead>
            <tbody>
              {kits.map((k) => (
                <tr key={k.id}>
                  <td>
                    <Link className="text-sky-300 hover:underline mono" href={`/kits/${k.id}`}>
                      {k.kitInstanceCode}
                    </Link>
                  </td>
                  <td>
                    <div className="font-medium">{k.kitDefinition.name}</div>
                    <div className="text-xs text-[var(--muted)] mono">
                      {k.kitDefinition.code}
                    </div>
                  </td>
                  <td>
                    <div className="text-sm">{k.demand?.type ?? "—"}</div>
                    <div className="text-xs text-[var(--muted)] mono">
                      {k.demand?.externalRef ?? "—"}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={k.status} />
                  </td>
                  <td className="mono text-sm">
                    {k.stagingLocation?.code ?? "—"}
                  </td>
                  <td className="mono text-xs text-violet-300">
                    {k.sealFingerprint
                      ? k.sealFingerprint.slice(0, 12).toUpperCase()
                      : "—"}
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
