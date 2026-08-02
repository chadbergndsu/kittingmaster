"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type KitOpt = {
  id: string;
  siteId: string;
  code: string;
  status: string;
  def: string;
  demand: string;
  type: string;
};

export function WaveBuilder({
  sites,
  kits,
}: {
  sites: Array<{ id: string; code: string; name: string }>;
  kits: KitOpt[];
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const siteKits = useMemo(
    () => kits.filter((k) => k.siteId === siteId),
    [kits, siteId]
  );

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/waves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, kitIds: selected, name: name || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Failed to create wave");
      return;
    }
    setMsg(`Created ${data.wave.code}`);
    setSelected([]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="field-label">Site</label>
          <select
            className="input"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setSelected([]);
            }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Wave name (optional)</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="AM Assembly Wave"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] max-h-72 overflow-auto">
        {siteKits.length === 0 && (
          <div className="p-4 text-sm text-[var(--muted)]">No eligible kits at this site.</div>
        )}
        {siteKits.map((k) => (
          <label
            key={k.id}
            className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-white/[0.03]"
          >
            <input
              type="checkbox"
              checked={selected.includes(k.id)}
              onChange={() => toggle(k.id)}
            />
            <span className="mono text-sky-200 text-sm font-semibold">{k.code}</span>
            <span className="text-xs text-[var(--muted)]">{k.def}</span>
            <span className="text-xs mono text-[var(--muted)] ml-auto">{k.status}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={busy || selected.length === 0}>
          {busy ? "Creating…" : `Create wave (${selected.length})`}
        </button>
        {msg && <span className="text-sm text-emerald-300">{msg}</span>}
        {err && <span className="text-sm text-rose-300">{err}</span>}
      </div>
    </form>
  );
}
