"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";

type Kit = {
  id: string;
  kitInstanceCode: string;
  status: string;
  lines: Array<{
    id: string;
    requiredQty: number;
    stagedQty: number;
    status: string;
    part: { sku: string; name: string; tracking: string; barcode?: string | null };
  }>;
  stagingLocation?: { code: string; barcode: string } | null;
};

export function ScanClient() {
  const search = useSearchParams();
  const initialKit = search.get("kitId") || "";
  const [kits, setKits] = useState<Kit[]>([]);
  const [kitId, setKitId] = useState(initialKit);
  const [barcode, setBarcode] = useState("");
  const [prompt, setPrompt] = useState("Select a kit, then scan staging cell");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/kits")
      .then((r) => r.json())
      .then((d) => {
        setKits(d.kits || []);
        if (!kitId && d.kits?.[0]) setKitId(d.kits[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!kitId) return;
    fetch(`/api/kits/${kitId}`)
      .then((r) => r.json())
      .then((d) => setKit(d.kit))
      .catch(() => {});
  }, [kitId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [prompt, kitId]);

  const progress = useMemo(() => {
    if (!kit) return "0/0";
    const s = kit.lines.reduce((a, l) => a + l.stagedQty, 0);
    const r = kit.lines.reduce((a, l) => a + l.requiredQty, 0);
    return `${s}/${r}`;
  }, [kit]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!kitId || !barcode.trim()) return;
    setError(null);
    setMessage(null);
    const clientEventId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientEventId,
        kitId,
        barcode: barcode.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBarcode("");
    if (!res.ok) {
      setError(data.error || "Scan failed");
      inputRef.current?.focus();
      return;
    }
    setMessage(data.message);
    setPrompt(data.prompt || prompt);
    if (data.kit) setKit(data.kit);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Scan console</h1>
        <p className="text-sm text-[var(--muted)]">
          Hardware wedge-friendly. Grammar: staging cell → part → lot/serial as required by
          Method DNA.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <label className="text-xs text-[var(--muted)]">Active kit</label>
        <select
          className="input"
          value={kitId}
          onChange={(e) => setKitId(e.target.value)}
        >
          <option value="">Select kit…</option>
          {kits.map((k) => (
            <option key={k.id} value={k.id}>
              {k.kitInstanceCode} ({k.status})
            </option>
          ))}
        </select>
        {kit && (
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <StatusBadge status={kit.status} />
            <span className="mono">progress {progress}</span>
            <span className="text-[var(--muted)]">
              cell {kit.stagingLocation?.code ?? "—"}
            </span>
          </div>
        )}
      </div>

      <div className="card p-6 text-center space-y-4">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Next expected
        </div>
        <div className="text-3xl md:text-4xl font-bold text-sky-200">{prompt}</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            ref={inputRef}
            className="input text-center text-xl mono"
            placeholder="Scan or type barcode…"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <button className="btn btn-primary w-full py-3 text-lg" type="submit">
            Accept scan
          </button>
        </form>
        {message && (
          <div className="text-emerald-300 text-sm border border-emerald-500/20 bg-emerald-500/10 rounded-lg px-3 py-2">
            {message}
          </div>
        )}
        {error && (
          <div className="text-rose-300 text-sm border border-rose-500/20 bg-rose-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {kit && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Tracking</th>
                <th>Staged</th>
              </tr>
            </thead>
            <tbody>
              {kit.lines.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.part.sku}</td>
                  <td className="mono text-xs">{l.part.tracking}</td>
                  <td className="mono">
                    {l.stagedQty}/{l.requiredQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
