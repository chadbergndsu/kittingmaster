import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { WaveBuilder } from "./WaveBuilder";
import { WaveReleaseButton } from "./WaveReleaseButton";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function WavesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [waves, sites, eligibleKits] = await Promise.all([
    prisma.wave.findMany({
      where: { organizationId: session.organizationId },
      include: {
        site: true,
        kits: {
          include: { kit: { include: { kitDefinition: true, demand: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.site.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { code: "asc" },
    }),
    prisma.kit.findMany({
      where: {
        organizationId: session.organizationId,
        status: { in: ["PENDING", "ALLOCATED", "PICKING", "EXCEPTION"] },
      },
      include: { kitDefinition: true, demand: true, site: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div>
      <PageHeader
        kicker="Operations · Wave picking"
        title="Batch pick waves"
        subtitle="Market-standard wave planning: group kits, release one consolidated pick list, reduce travel. Aligns with WMS batch/wave practice used in assembly and fulfillment kitting."
      />

      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="font-semibold">Build wave</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Select open kits for a site — release generates batch aggregate + per-kit lists
            </div>
          </div>
        </div>
        <div className="card-body">
          <WaveBuilder
            sites={sites.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
            kits={eligibleKits.map((k) => ({
              id: k.id,
              siteId: k.siteId,
              code: k.kitInstanceCode,
              status: k.status,
              def: k.kitDefinition.code,
              demand: k.demand?.externalRef ?? "",
              type: k.demand?.type ?? "",
            }))}
          />
        </div>
      </div>

      <div className="space-y-4">
        {waves.map((w) => (
          <div key={w.id} className="card">
            <div className="card-header">
              <div>
                <div className="font-semibold mono text-sky-200">{w.code}</div>
                <div className="text-xs text-[var(--muted)]">
                  {w.name} · {w.site.code} · {w.kits.length} kits
                </div>
              </div>
              <StatusBadge status={w.status} />
            </div>
            <div className="card-body">
              <div className="grid md:grid-cols-2 gap-2 mb-3">
                {w.kits.map((wk) => (
                  <div
                    key={wk.id}
                    className="flex justify-between text-sm border border-[var(--border)] rounded-lg px-3 py-2 gap-2"
                  >
                    <span className="mono">{wk.kit.kitInstanceCode}</span>
                    <StatusBadge status={wk.kit.status} />
                  </div>
                ))}
              </div>
              <WaveReleaseButton waveId={w.id} status={w.status} />
            </div>
          </div>
        ))}
        {waves.length === 0 && (
          <div className="text-sm text-[var(--muted)]">No waves yet — create one above.</div>
        )}
      </div>
    </div>
  );
}
