"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Part = {
  id: string;
  sku: string;
  name: string;
  tracking: string;
};
type Location = {
  id: string;
  code: string;
  barcode: string;
  type: string;
  zone: { code: string; site: { id: string; code: string } };
};
type Site = { id: string; code: string; name: string };

export function ReceiptForm({
  parts,
  locations,
  sites,
}: {
  parts: Part[];
  locations: Location[];
  sites: Site[];
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState(1);
  const [lotNumber, setLotNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const part = parts.find((p) => p.id === partId);
  const siteLocations = locations.filter((l) => l.zone.site.id === siteId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/inventory/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        locationId: locationId || siteLocations[0]?.id,
        partId,
        qty: Number(qty),
        lotNumber: lotNumber || undefined,
        serialNumber: serialNumber || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Receipt failed");
      return;
    }
    setMsg(`Received ${qty} × ${part?.sku}`);
    setLotNumber("");
    setSerialNumber("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-3 gap-3">
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
        <label className="field-label">Part</label>
        <select className="input" value={partId} onChange={(e) => setPartId(e.target.value)}>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.tracking}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Location (bin)</label>
        <select
          className="input"
          value={locationId || siteLocations[0]?.id || ""}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {siteLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.zone.code}/{l.code} ({l.type})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Qty</label>
        <input
          className="input mono"
          type="number"
          min={1}
          step="1"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </div>
      {(part?.tracking === "LOT" || part?.tracking === "LOT_AND_SERIAL") && (
        <div>
          <label className="field-label">Lot number</label>
          <input
            className="input mono"
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            placeholder="LOT-..."
            required
          />
        </div>
      )}
      {(part?.tracking === "SERIAL" || part?.tracking === "LOT_AND_SERIAL") && (
        <div>
          <label className="field-label">Serial number</label>
          <input
            className="input mono"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="SN-..."
            required
          />
        </div>
      )}
      <div className="md:col-span-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Posting…" : "Post receipt to RAW ledger"}
        </button>
        {msg && <span className="text-sm text-emerald-300">{msg}</span>}
        {err && <span className="text-sm text-rose-300">{err}</span>}
      </div>
    </form>
  );
}
