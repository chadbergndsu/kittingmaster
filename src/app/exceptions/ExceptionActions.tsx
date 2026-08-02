"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExceptionActions({ kitId }: { kitId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/ops/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", kitId, resumeStatus: "PICKING" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Clear failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-success" type="button" disabled={busy} onClick={clear}>
        {busy ? "Clearing…" : "Resume picking"}
      </button>
      {err && <span className="text-xs text-rose-300">{err}</span>}
    </div>
  );
}
