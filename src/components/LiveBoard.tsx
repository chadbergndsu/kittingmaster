"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

type KitRow = {
  id: string;
  kitInstanceCode: string;
  status: string;
  sealFingerprint: string | null;
  kitDefinition: { name: string; code: string };
  demand: { type: string; externalRef: string } | null;
  stagingLocation: { code: string } | null;
  lines: Array<{ stagedQty: number; requiredQty: number }>;
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  payloadJson: string | null;
};

const STATUS_ORDER = [
  "PENDING",
  "ALLOCATED",
  "PICKING",
  "STAGED",
  "VALIDATING",
  "SEALED",
  "RELEASED",
  "EXCEPTION",
];

export function LiveBoard({
  initialKits,
  initialCounts,
  organizationName,
}: {
  initialKits: KitRow[];
  initialCounts: Record<string, number>;
  organizationName: string;
}) {
  const [kits, setKits] = useState(initialKits);
  const [counts, setCounts] = useState(initialCounts);
  const [activity, setActivity] = useState<AuditItem[]>([]);
  const [live, setLive] = useState(false);
  const [lastPulse, setLastPulse] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [metrics, setMetrics] = useState<{
    sealedToday: number;
    avgStageMinutes: number | null;
    sealRatePct: number;
    overdue: number;
    agingOver4h: number;
    throughputLast24h: number;
    exceptions: number;
  } | null>(null);
  const [criticalShortages, setCriticalShortages] = useState(0);

  useEffect(() => {
    fetch("/api/ops/metrics")
      .then((r) => r.json())
      .then((d) => d.metrics && setMetrics(d.metrics))
      .catch(() => {});
    fetch("/api/ops/shortages")
      .then((r) => r.json())
      .then((d) => setCriticalShortages(d.criticalCount || 0))
      .catch(() => {});
    const t = setInterval(() => {
      fetch("/api/ops/metrics")
        .then((r) => r.json())
        .then((d) => d.metrics && setMetrics(d.metrics))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("hello", () => setLive(true));
    es.addEventListener("counts", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        setCounts((prev) => ({ ...prev, ...data.counts }));
        setLastPulse(data.at);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("kits", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { items: KitRow[] };
        setKits((prev) => {
          const map = new Map(prev.map((k) => [k.id, k]));
          for (const k of data.items) map.set(k.id, k);
          return Array.from(map.values()).sort((a, b) =>
            b.kitInstanceCode.localeCompare(a.kitInstanceCode)
          );
        });
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("audit", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { items: AuditItem[] };
        setActivity((prev) => [...data.items.reverse(), ...prev].slice(0, 25));
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => setLive(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => {
        if (d.events) {
          setActivity(
            d.events.map((e: AuditItem & { createdAt: string }) => ({
              ...e,
              createdAt: e.createdAt,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (filter === "ALL") return kits;
    return kits.filter((k) => k.status === filter);
  }, [kits, filter]);

  const sealed = (counts.SEALED || 0) + (counts.RELEASED || 0);
  const inFlight =
    (counts.ALLOCATED || 0) +
    (counts.PICKING || 0) +
    (counts.STAGED || 0) +
    (counts.VALIDATING || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className={`badge ${live ? "text-emerald-300" : "text-amber-300"}`}>
            <span className="live-dot" style={{ opacity: live ? 1 : 0.35 }} />
            {live ? "SSE LIVE" : "RECONNECTING"}
          </span>
          {lastPulse && (
            <span className="mono">pulse {new Date(lastPulse).toLocaleTimeString()}</span>
          )}
          <span>· {organizationName}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/scan" className="btn">
            Open scan
          </Link>
          <Link href="/kits" className="btn btn-primary">
            Manage kits
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(56,189,248,0.5)" }} />
          <div className="stat-label">In flight</div>
          <div className="stat-value text-sky-300">{inFlight}</div>
          <div className="stat-meta">Active pipeline</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(167,139,250,0.5)" }} />
          <div className="stat-label">Sealed kit ledger</div>
          <div className="stat-value text-violet-300">{sealed}</div>
          <div className="stat-meta">Sealed + released</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(52,211,153,0.4)" }} />
          <div className="stat-label">Sealed today</div>
          <div className="stat-value text-emerald-300">{metrics?.sealedToday ?? "—"}</div>
          <div className="stat-meta">UTC day throughput</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(125,211,252,0.35)" }} />
          <div className="stat-label">24h seals</div>
          <div className="stat-value text-sky-200">{metrics?.throughputLast24h ?? "—"}</div>
          <div className="stat-meta">Rolling window</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(196,181,253,0.4)" }} />
          <div className="stat-label">Seal rate</div>
          <div className="stat-value text-violet-200">
            {metrics ? `${metrics.sealRatePct}%` : "—"}
          </div>
          <div className="stat-meta">Sealed/released ÷ total</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(251,191,36,0.35)" }} />
          <div className="stat-label">Avg stage min</div>
          <div className="stat-value text-amber-300">
            {metrics?.avgStageMinutes ?? "—"}
          </div>
          <div className="stat-meta">Create → seal</div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(251,113,133,0.4)" }} />
          <div className="stat-label">Exceptions</div>
          <div className="stat-value text-rose-300">
            {metrics?.exceptions ?? counts.EXCEPTION ?? 0}
          </div>
          <div className="stat-meta">
            <Link href="/exceptions" className="link-accent">
              Open board
            </Link>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-glow" style={{ background: "rgba(248,113,113,0.35)" }} />
          <div className="stat-label">Shortages</div>
          <div className="stat-value text-rose-200">{criticalShortages}</div>
          <div className="stat-meta">
            {metrics?.overdue ? `${metrics.overdue} overdue · ` : ""}
            {metrics?.agingOver4h ? `${metrics.agingOver4h} aging` : "material risk"}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="font-semibold">Status pipeline</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">Live lifecycle distribution</div>
          </div>
        </div>
        <div className="card-body">
          <div className="pipeline">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`pipeline-step status-${s} text-left cursor-pointer ${
                  filter === s ? "ring-1 ring-sky-400/50" : ""
                }`}
                onClick={() => setFilter(filter === s ? "ALL" : s)}
              >
                <div className="text-[0.65rem] uppercase tracking-wider opacity-80 font-bold">
                  {s}
                </div>
                <div className="mono text-2xl font-bold mt-1">{counts[s] || 0}</div>
                <div className="bar" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_0.9fr] gap-4">
        <div className="card overflow-hidden">
          <div className="card-header">
            <div>
              <div className="font-semibold">Kit worklist</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {filter === "ALL" ? "All statuses" : `Filtered: ${filter}`} · click pipeline to filter
              </div>
            </div>
            {filter !== "ALL" && (
              <button className="btn btn-ghost" type="button" onClick={() => setFilter("ALL")}>
                Clear filter
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Instance</th>
                  <th>Definition</th>
                  <th>Demand</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Seal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => {
                  const staged = k.lines.reduce((a, l) => a + l.stagedQty, 0);
                  const required = k.lines.reduce((a, l) => a + l.requiredQty, 0) || 1;
                  const pct = Math.min(100, Math.round((staged / required) * 100));
                  return (
                    <tr key={k.id}>
                      <td>
                        <Link className="link-accent mono font-semibold" href={`/kits/${k.id}`}>
                          {k.kitInstanceCode}
                        </Link>
                      </td>
                      <td>
                        <div className="font-medium text-sm">{k.kitDefinition.name}</div>
                        <div className="text-xs text-[var(--muted)] mono">
                          {k.kitDefinition.code}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm">
                          {k.demand?.type === "ASSEMBLY_JOB" ? "Assembly" : "Fulfillment"}
                        </div>
                        <div className="text-xs text-[var(--muted)] mono">
                          {k.demand?.externalRef ?? "—"}
                        </div>
                      </td>
                      <td className="min-w-[120px]">
                        <div className="flex justify-between text-[0.7rem] mono text-[var(--muted)] mb-1">
                          <span>
                            {staged}/{required}
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={k.status} />
                      </td>
                      <td className="mono text-xs">
                        {k.sealFingerprint ? (
                          <span className="seal-code">
                            {k.sealFingerprint.slice(0, 12).toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-[var(--muted)] py-8">
                      No kits in this filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="font-semibold">Activity stream</div>
            <span className="badge mono">{activity.length}</span>
          </div>
          <div className="card-body max-h-[560px] overflow-auto space-y-2">
            {activity.length === 0 && (
              <div className="text-sm text-[var(--muted)]">Waiting for events…</div>
            )}
            {activity.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-[var(--border)] px-3 py-2 bg-white/[0.02]"
              >
                <div className="flex justify-between gap-2">
                  <span className="mono text-xs text-amber-200 font-bold">{e.action}</span>
                  <span className="mono text-[0.65rem] text-[var(--muted)]">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {e.entityType} · <span className="mono">{e.entityId.slice(0, 10)}…</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
