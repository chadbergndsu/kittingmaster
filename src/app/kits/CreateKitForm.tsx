"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CreateKitForm({
  sites,
  definitions,
}: {
  sites: Array<{ id: string; code: string; name: string }>;
  definitions: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [kitDefinitionId, setKitDefinitionId] = useState(definitions[0]?.id ?? "");
  const [demandType, setDemandType] = useState("ASSEMBLY_JOB");
  const [externalRef, setExternalRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        kitDefinitionId,
        demandType,
        externalRef: externalRef || `REF-${Date.now()}`,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create kit");
      return;
    }
    const data = await res.json();
    router.push(`/kits/${data.kit.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-5 gap-3 items-end">
      <div>
        <label className="field-label">Site</label>
        <select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Kit definition</label>
        <select
          className="input"
          value={kitDefinitionId}
          onChange={(e) => setKitDefinitionId(e.target.value)}
        >
          {definitions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Demand type</label>
        <select
          className="input"
          value={demandType}
          onChange={(e) => setDemandType(e.target.value)}
        >
          <option value="ASSEMBLY_JOB">Assembly job</option>
          <option value="FULFILLMENT_ORDER">Fulfillment order</option>
        </select>
      </div>
      <div>
        <label className="field-label">External ref</label>
        <input
          className="input mono"
          placeholder="WO-2001 / SO-9001"
          value={externalRef}
          onChange={(e) => setExternalRef(e.target.value)}
        />
      </div>
      <div>
        <button className="btn btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Creating…" : "Create kit"}
        </button>
        {error && <div className="text-xs text-rose-300 mt-1.5">{error}</div>}
      </div>
    </form>
  );
}
