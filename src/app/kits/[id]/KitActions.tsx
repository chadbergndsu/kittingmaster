"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function KitActions({ kitId, status }: { kitId: string; status: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setMsg(`${label} OK`);
    router.refresh();
  }

  return (
    <div className="card p-4 flex flex-wrap gap-2 items-center">
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
      {msg && <span className="text-sm text-emerald-300">{msg}</span>}
      {err && <span className="text-sm text-rose-300">{err}</span>}
    </div>
  );
}
