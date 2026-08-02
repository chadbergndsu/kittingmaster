"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/webhook")
      .then((r) => r.json())
      .then((d) => setWebhookUrl(d.webhookUrl || ""))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/settings/webhook", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: webhookUrl || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setMsg("Webhook saved");
  }

  return (
    <div>
      <PageHeader
        kicker="System · Integrations"
        title="ERP / MRP connectivity"
        subtitle="Market WMS kitting tools integrate outbound events into ERP and MRP. Configure a webhook endpoint to receive kit.sealed and kit.exception payloads."
        actions={
          <a className="btn" href="/api/export/kits">
            Export kits CSV
          </a>
        }
      />

      <div className="card max-w-2xl">
        <div className="card-header">
          <div className="font-semibold">Outbound webhook</div>
        </div>
        <div className="card-body">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="field-label">Webhook URL</label>
              <input
                className="input mono"
                placeholder="https://erp.example.com/hooks/kittingmaster"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
                POST JSON with header <span className="mono">X-KittingMaster-Event</span>. Events:{" "}
                <span className="mono">kit.sealed</span>, <span className="mono">kit.exception</span>.
                Delivery is async with a 4s timeout and never blocks shop-floor seals.
              </p>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save integration"}
            </button>
            {msg && <div className="text-sm text-emerald-300">{msg}</div>}
            {err && <div className="text-sm text-rose-300">{err}</div>}
          </form>
        </div>
      </div>

      <div className="card max-w-2xl mt-4">
        <div className="card-header">
          <div className="font-semibold">Integration exports</div>
        </div>
        <div className="card-body text-sm text-[var(--muted)] space-y-2">
          <p>
            <a className="link-accent" href="/api/export/kits">
              GET /api/export/kits
            </a>{" "}
            — CSV of kit instances for ERP reconciliation.
          </p>
          <p>
            <span className="mono text-sky-200">GET /api/ops/metrics</span> — throughput KPIs JSON.
          </p>
          <p>
            <span className="mono text-sky-200">GET /api/ops/shortages</span> — material shortage board.
          </p>
          <p>
            <span className="mono text-sky-200">GET /api/events</span> — SSE live board stream.
          </p>
        </div>
      </div>
    </div>
  );
}
