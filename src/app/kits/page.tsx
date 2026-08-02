import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { CreateKitForm } from "./CreateKitForm";
import { KitFilters } from "./KitFilters";

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

      <KitFilters
        kits={kits.map((k) => ({
          id: k.id,
          kitInstanceCode: k.kitInstanceCode,
          status: k.status,
          staged: k.lines.reduce((a, l) => a + l.stagedQty, 0),
          required: k.lines.reduce((a, l) => a + l.requiredQty, 0),
          demandType: k.demand?.type ?? null,
          externalRef: k.demand?.externalRef ?? null,
          defName: k.kitDefinition.name,
          dnaVersion: k.dnaVersion.version,
        }))}
      />
    </div>
  );
}
