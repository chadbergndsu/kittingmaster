import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { LiveBoard } from "@/components/LiveBoard";

export const dynamic = "force-dynamic";

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

  return (
    <div>
      <PageHeader
        kicker="Operations · Command board"
        title="Live kit control"
        subtitle={`Real-time dual-ledger status for ${session.organizationName}. Stream updates via SSE while operators stage and seal.`}
      />
      <LiveBoard
        organizationName={session.organizationName}
        initialCounts={counts}
        initialKits={kits.map((k) => ({
          id: k.id,
          kitInstanceCode: k.kitInstanceCode,
          status: k.status,
          sealFingerprint: k.sealFingerprint,
          kitDefinition: { name: k.kitDefinition.name, code: k.kitDefinition.code },
          demand: k.demand
            ? { type: k.demand.type, externalRef: k.demand.externalRef }
            : null,
          stagingLocation: k.stagingLocation ? { code: k.stagingLocation.code } : null,
          lines: k.lines.map((l) => ({
            stagedQty: l.stagedQty,
            requiredQty: l.requiredQty,
          })),
        }))}
      />
    </div>
  );
}
