import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DnaExportButton } from "./DnaExportButton";

export const dynamic = "force-dynamic";

export default async function DnaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dnas = await prisma.methodDna.findMany({
    where: { organizationId: session.organizationId },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customer Method DNA</h1>
          <p className="text-sm text-[var(--muted)] max-w-2xl">
            Per-tenant intellectual property profile. Strategies for allocation, pick path,
            staging, scan grammar, validation, seal, documents, and exceptions. Published
            versions are immutable and bound to kits at creation.
          </p>
        </div>
        <DnaExportButton />
      </div>

      {dnas.map((dna) => (
        <div key={dna.id} className="card p-5 space-y-4">
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">{dna.name}</div>
              <div className="text-xs text-[var(--muted)]">
                {dna.isDefault ? "Default DNA" : "Alternate"} · org-scoped IP
              </div>
            </div>
          </div>
          {dna.versions.map((v) => {
            const strategies = JSON.parse(v.strategiesJson) as Record<string, string>;
            const config = JSON.parse(v.configJson) as Record<string, unknown>;
            return (
              <div
                key={v.id}
                className="border border-[var(--border)] rounded-xl p-4 bg-black/20"
              >
                <div className="flex flex-wrap gap-2 items-center mb-3">
                  <span className="badge mono">v{v.version}</span>
                  {v.isPublished ? (
                    <span className="badge text-emerald-300">published</span>
                  ) : (
                    <span className="badge">draft</span>
                  )}
                  <span className="text-xs mono text-[var(--muted)]">
                    {v.contentHash.slice(0, 16)}…
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs uppercase text-[var(--muted)] mb-2">
                      Strategy slots
                    </div>
                    <ul className="space-y-1 text-sm">
                      {Object.entries(strategies).map(([k, val]) => (
                        <li key={k} className="flex justify-between gap-2">
                          <span className="text-[var(--muted)]">{k}</span>
                          <span className="mono text-sky-200 text-xs">{val}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-[var(--muted)] mb-2">Config</div>
                    <pre className="text-xs mono whitespace-pre-wrap text-violet-100/90">
                      {JSON.stringify(config, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
