"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function KitActions({ kitId, status }: { kitId: string; status: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function run(path: string, label: string) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch(path, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || `${label} failed`);
      return;
    }
    setMsg(`${label} complete`);
    router.refresh();
  }

  async function raiseException() {
    if (!reason.trim()) {
      setErr("Exception reason required");
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/ops/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kitId, reason: reason.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Exception failed");
      return;
    }
    setMsg("Marked EXCEPTION");
    setReason("");
    router.refresh();
  }

  return (
    <div className="card">
      <div className="card-body space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Link className="btn btn-primary" href={`/scan?kitId=${kitId}`}>
            Open scan console
          </Link>
          <button
            className="btn"
            disabled={busy}
            type="button"
            onClick={() => run(`/api/kits/${kitId}/pick-list`, "Pick list")}
          >
            Generate pick list
          </button>
          <button
            className="btn btn-seal"
            disabled={busy || status === "SEALED" || status === "RELEASED"}
            type="button"
            onClick={() => run(`/api/kits/${kitId}/seal`, "Seal")}
          >
            Validate & seal
          </button>
          <button
            className="btn btn-success"
            disabled={busy || status !== "SEALED"}
            type="button"
            onClick={() => run(`/api/kits/${kitId}/release`, "Release")}
          >
            Release kit
          </button>
          {msg && <span className="text-sm text-emerald-300 ml-1">{msg}</span>}
          {err && <span className="text-sm text-rose-300 ml-1">{err}</span>}
        </div>
        {!["SEALED", "RELEASED", "CANCELLED", "EXCEPTION"].includes(status) && (
          <div className="flex flex-wrap gap-2 items-end border-t border-[var(--border)] pt-3">
            <div className="flex-1 min-w-[200px]">
              <label className="field-label">Raise exception</label>
              <input
                className="input"
                placeholder="Shortage, damage, wrong lot…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <button className="btn" type="button" disabled={busy} onClick={raiseException}>
              Flag exception
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
