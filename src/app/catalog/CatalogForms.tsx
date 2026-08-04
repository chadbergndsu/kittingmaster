"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Part = { id: string; sku: string; name: string };

export function CreatePartForm() {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [tracking, setTracking] = useState("NONE");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/catalog/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, name, tracking }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setMsg(`Created ${data.part.sku}`);
    setSku("");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-4 gap-3 items-end">
      <div>
        <label className="field-label">SKU</label>
        <input
          className="input mono"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="field-label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">Tracking</label>
        <select className="input" value={tracking} onChange={(e) => setTracking(e.target.value)}>
          <option value="NONE">NONE</option>
          <option value="LOT">LOT</option>
          <option value="SERIAL">SERIAL</option>
          <option value="LOT_AND_SERIAL">LOT_AND_SERIAL</option>
        </select>
      </div>
      <div>
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Saving…" : "Add part"}
        </button>
        {msg && <div className="text-xs text-emerald-300 mt-1">{msg}</div>}
        {err && <div className="text-xs text-rose-300 mt-1">{err}</div>}
      </div>
    </form>
  );
}

export function CreateBomForm({ parts }: { parts: Part[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [linePartId, setLinePartId] = useState(parts[0]?.id ?? "");
  const [lineQty, setLineQty] = useState(1);
  const [lines, setLines] = useState<Array<{ partId: string; qty: number; sku: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addLine() {
    const p = parts.find((x) => x.id === linePartId);
    if (!p) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.partId === p.id);
      if (existing) {
        return prev.map((l) => (l.partId === p.id ? { ...l, qty: l.qty + Number(lineQty) } : l));
      }
      return [...prev, { partId: p.id, qty: Number(lineQty), sku: p.sku }];
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setErr("Add at least one BOM line");
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/catalog/kit-definitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name,
        lines: lines.map((l) => ({ partId: l.partId, qty: l.qty })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setMsg(`Created ${data.kitDefinition.code}`);
    setCode("");
    setName("");
    setLines([]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="field-label">Code</label>
          <input
            className="input mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid md:grid-cols-[1fr_100px_auto] gap-2 items-end">
        <div>
          <label className="field-label">Add line part</label>
          <select
            className="input"
            value={linePartId}
            onChange={(e) => setLinePartId(e.target.value)}
          >
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Qty</label>
          <input
            className="input mono"
            type="number"
            min={0.001}
            step="any"
            value={lineQty}
            onChange={(e) => setLineQty(Number(e.target.value))}
          />
        </div>
        <button className="btn" type="button" onClick={addLine}>
          Add line
        </button>
      </div>
      {lines.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
          {lines.map((l) => (
            <div key={l.partId} className="flex justify-between px-3 py-2 text-sm mono">
              <span>{l.sku}</span>
              <span>× {l.qty}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Saving…" : "Create kit definition"}
        </button>
        {msg && <span className="text-sm text-emerald-300">{msg}</span>}
        {err && <span className="text-sm text-rose-300">{err}</span>}
      </div>
    </form>
  );
}
