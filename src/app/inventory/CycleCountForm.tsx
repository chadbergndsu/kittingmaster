"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CycleCountForm({
  parts,
  locations,
  sites,
}: {
  parts: Array<{ id: string; sku: string }>;
  locations: Array<{
    id: string;
    code: string;
    zone: { code: string; site: { id: string; code: string } };
  }>;
  sites: Array<{ id: string; code: string }>;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [locationId, setLocationId] = useState("");
  const [countedQty, setCountedQty] = useState(0);
  const [reason, setReason] = useState("Cycle count");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const siteLocs = locations.filter((l) => l.zone.site.id === siteId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/inventory/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        locationId: locationId || siteLocs[0]?.id,
        partId,
        countedQty: Number(countedQty),
        reason,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Adjust failed");
      return;
    }
    setMsg(`Adjusted ${data.previous} → ${data.counted} (Δ ${data.delta})`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-3 gap-3">
      <div>
        <label className="field-label">Site</label>
        <select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Part</label>
        <select className="input" value={partId} onChange={(e) => setPartId(e.target.value)}>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Location</label>
        <select
          className="input"
          value={locationId || siteLocs[0]?.id || ""}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {siteLocs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.zone.code}/{l.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Counted qty</label>
        <input
          className="input mono"
          type="number"
          min={0}
          value={countedQty}
          onChange={(e) => setCountedQty(Number(e.target.value))}
        />
      </div>
      <div>
        <label className="field-label">Reason</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex items-end">
        <button className="btn w-full" type="submit" disabled={busy}>
          {busy ? "Posting…" : "Post cycle count"}
        </button>
      </div>
      {(msg || err) && (
        <div className="md:col-span-3 text-sm">
          {msg && <span className="text-emerald-300">{msg}</span>}
          {err && <span className="text-rose-300">{err}</span>}
        </div>
      )}
    </form>
  );
}
