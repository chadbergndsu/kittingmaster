"use client";

import { useState } from "react";

export function DnaExportButton() {
  const [status, setStatus] = useState<string | null>(null);

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

  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-primary" type="button" onClick={exportPack}>
        Export DNA pack
      </button>
      {status && <span className="text-xs text-[var(--muted)]">{status}</span>}
    </div>
  );
}
