"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WaveReleaseButton({ waveId, status }: { waveId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (status !== "OPEN") {
    return (
      <div className="text-xs text-[var(--muted)]">
        Wave {status.toLowerCase()}
        {status === "RELEASED" ? " — pick lists generated on member kits" : ""}
      </div>
    );
  }

  async function release() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/waves/${waveId}/release`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Release failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button className="btn btn-primary" type="button" disabled={busy} onClick={release}>
        {busy ? "Releasing…" : "Release wave pick list"}
      </button>
      {err && <span className="text-sm text-rose-300">{err}</span>}
    </div>
  );
}
