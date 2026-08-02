"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DnaActions() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportPack() {
    setStatus("Exporting…");
    const res = await fetch("/api/dna", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || "Export failed");
      return;
    }
    const blob = new Blob([JSON.stringify(data.pack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `method-dna-${data.pack?.customer?.slug || "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("DNA pack downloaded");
  }

  async function publish() {
    setBusy(true);
    setStatus("Publishing…");
    const res = await fetch("/api/dna/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error || "Publish failed");
      return;
    }
    setStatus(`Published v${data.version.version}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn" type="button" onClick={exportPack}>
        Export DNA pack
      </button>
      <button className="btn btn-seal" type="button" disabled={busy} onClick={publish}>
        {busy ? "Publishing…" : "Publish next version"}
      </button>
      {status && <span className="text-xs text-[var(--muted)]">{status}</span>}
    </div>
  );
}
