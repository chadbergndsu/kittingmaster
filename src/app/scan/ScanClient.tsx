"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";

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
  const [busy, setBusy] = useState(false);
  const [fsmState, setFsmState] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/kits")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load kits");
        return r.json();
      })
      .then((d) => {
        setKits(d.kits || []);
        if (!kitId && d.kits?.[0]) setKitId(d.kits[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load kits"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!kitId) return;
    fetch(`/api/kits/${kitId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load kit");
        return r.json();
      })
      .then((d) => setKit(d.kit))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load kit"));
  }, [kitId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [prompt, kitId]);

  const progress = useMemo(() => {
    if (!kit) return { s: 0, r: 0, pct: 0, linesDone: 0, linesTotal: 0 };
    const linesDone = kit.lines.filter((l) => l.stagedQty + 1e-9 >= l.requiredQty).length;
    const linesTotal = kit.lines.length || 1;
    const s = kit.lines.reduce((a, l) => a + l.stagedQty, 0);
    const r = kit.lines.reduce((a, l) => a + l.requiredQty, 0) || 1;
    // Prefer line completeness for seal readiness
    return {
      s,
      r,
      pct: Math.min(100, Math.round((linesDone / linesTotal) * 100)),
      linesDone,
      linesTotal,
    };
  }, [kit]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!kitId || !barcode.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const clientEventId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    try {
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
        return;
      }
      setMessage(data.message);
      setPrompt(data.prompt || prompt);
      if (data.state) setFsmState(data.state);
      if (data.kit) setKit(data.kit);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        kicker="Operations · Scan console"
        title="Stage with scan grammar"
        subtitle="Hardware-wedge ready. Default DNA path: staging cell → part → lot/serial as required."
      />

      <div className="grid md:grid-cols-[1fr_280px] gap-4 mb-4">
        <div className="card">
          <div className="card-body space-y-3">
            <label className="field-label">Active kit session</label>
            <select className="input mono" value={kitId} onChange={(e) => setKitId(e.target.value)}>
              <option value="">Select kit…</option>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.kitInstanceCode} · {k.status}
                </option>
              ))}
            </select>
            {kit && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <StatusBadge status={kit.status} />
                <span className="mono text-sm text-[var(--text-secondary)]">
                  {progress.s}/{progress.r} staged · {progress.linesDone}/{progress.linesTotal}{" "}
                  lines
                </span>
                <span className="badge mono">CELL {kit.stagingLocation?.code ?? "unbound"}</span>
                {fsmState && <span className="badge mono">FSM {fsmState}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(56,189,248,0.45)" }} />
          <div className="stat-label">Session progress</div>
          <div className="stat-value text-sky-300">{progress.pct}%</div>
          <div className="progress-track mt-3">
            <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="stat-meta mt-2">Line completeness toward seal</div>
        </div>
      </div>

      <div className="scan-hero mb-4">
        <div className="relative z-1 text-[0.68rem] uppercase tracking-[0.22em] text-sky-200/70 font-bold mb-3">
          Next expected scan
        </div>
        <div className="scan-prompt mb-6">{prompt}</div>
        <form onSubmit={onSubmit} className="relative z-1 max-w-xl mx-auto space-y-3">
          <input
            ref={inputRef}
            className="input scan-input mono"
            placeholder="Scan or type barcode…"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoComplete="off"
            autoFocus
            disabled={busy}
          />
          <button className="btn btn-primary w-full py-3.5 text-base" type="submit" disabled={busy}>
            {busy ? "Processing…" : "Accept scan event"}
          </button>
        </form>
        <div className="relative z-1 mt-4 space-y-2 max-w-xl mx-auto">
          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </div>

      {kit && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="font-semibold">BOM stage status</div>
            <span className="text-xs mono text-[var(--muted)]">{kit.kitInstanceCode}</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Part</th>
                <th>Tracking</th>
                <th>Staged</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {kit.lines.map((l) => (
                <tr key={l.id}>
                  <td className="mono font-semibold text-sky-200/90">{l.part.sku}</td>
                  <td className="text-sm">{l.part.name}</td>
                  <td>
                    <span className="badge mono">{l.part.tracking}</span>
                  </td>
                  <td className="mono">
                    {l.stagedQty}/{l.requiredQty}
                  </td>
                  <td>
                    <StatusBadge status={l.status} />
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
