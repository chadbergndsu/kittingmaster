import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { DnaActions } from "./DnaActions";

export const dynamic = "force-dynamic";

export default async function DnaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dnas = await prisma.methodDna.findMany({
    where: { organizationId: session.organizationId },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <div>
      <PageHeader
        kicker="System · Method DNA"
        title="Customer method intelligence"
        subtitle="Per-tenant intellectual property profile. Publish new immutable versions; kits bind DNA at creation and never leak across tenants."
        actions={<DnaActions />}
      />

      {dnas.map((dna) => (
        <div key={dna.id} className="card mb-5">
          <div className="card-header">
            <div>
              <div className="font-semibold text-lg">{dna.name}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {dna.isDefault ? "Default DNA for tenant" : "Alternate profile"} · org-scoped IP
              </div>
            </div>
            {dna.isDefault && <span className="badge text-emerald-300">DEFAULT</span>}
          </div>
          <div className="card-body space-y-4">
            {dna.versions.map((v) => {
              const strategies = JSON.parse(v.strategiesJson) as Record<string, string>;
              const config = JSON.parse(v.configJson) as Record<string, unknown>;
              return (
                <div
                  key={v.id}
                  className="rounded-xl border border-[var(--border)] bg-gradient-to-br from-violet-500/5 to-sky-500/5 p-4"
                >
                  <div className="flex flex-wrap gap-2 items-center mb-4">
                    <span className="badge mono text-violet-200">v{v.version}</span>
                    {v.isPublished ? (
                      <span className="badge text-emerald-300">published</span>
                    ) : (
                      <span className="badge">draft</span>
                    )}
                    <span className="text-xs mono text-[var(--muted)]">
                      {v.contentHash.slice(0, 20)}…
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="field-label">Strategy slots</div>
                      <ul className="space-y-1.5">
                        {Object.entries(strategies).map(([k, val]) => (
                          <li
                            key={k}
                            className="flex justify-between gap-3 text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-black/20"
                          >
                            <span className="text-[var(--muted)]">{k}</span>
                            <span className="mono text-xs text-sky-200 text-right">{val}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="field-label">Config payload</div>
                      <pre className="text-xs mono whitespace-pre-wrap text-violet-100/85 rounded-xl border border-[var(--border)] bg-black/30 p-3 leading-relaxed">
                        {JSON.stringify(config, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
