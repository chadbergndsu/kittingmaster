"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";

type Kit = {
  id: string;
  kitInstanceCode: string;
  status: string;
  staged: number;
  required: number;
  demandType: string | null;
  externalRef: string | null;
  defName: string;
  dnaVersion: string;
};

export function KitFilters({ kits }: { kits: Kit[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");

  const filtered = useMemo(() => {
    return kits.filter((k) => {
      if (status !== "ALL" && k.status !== status) return false;
      if (type !== "ALL" && k.demandType !== type) return false;
      if (q) {
        const hay = `${k.kitInstanceCode} ${k.defName} ${k.externalRef ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [kits, q, status, type]);

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex-wrap gap-3">
        <div className="font-semibold">All kits</div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="input !py-1.5 !text-sm w-44"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input !py-1.5 !text-sm w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            {[
              "PENDING",
              "ALLOCATED",
              "PICKING",
              "STAGED",
              "SEALED",
              "RELEASED",
              "EXCEPTION",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="input !py-1.5 !text-sm w-auto"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="ALL">All types</option>
            <option value="ASSEMBLY_JOB">Assembly</option>
            <option value="FULFILLMENT_ORDER">Fulfillment</option>
          </select>
          <span className="badge mono">{filtered.length}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Kit</th>
              <th>Type</th>
              <th>Progress</th>
              <th>Status</th>
              <th>DNA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => {
              const pct = Math.min(
                100,
                Math.round((k.staged / (k.required || 1)) * 100)
              );
              return (
                <tr key={k.id}>
                  <td>
                    <div className="mono font-semibold text-sky-200/90">
                      {k.kitInstanceCode}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{k.defName}</div>
                  </td>
                  <td className="text-sm">
                    {k.demandType === "ASSEMBLY_JOB" ? "Assembly" : "Fulfillment"}
                    <div className="text-xs text-[var(--muted)] mono">{k.externalRef}</div>
                  </td>
                  <td className="min-w-[130px]">
                    <div className="flex justify-between text-[0.7rem] mono text-[var(--muted)] mb-1">
                      <span>
                        {k.staged}/{k.required}
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
                  <td className="mono text-xs text-violet-200/90">v{k.dnaVersion}</td>
                  <td>
                    <Link className="btn" href={`/kits/${k.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-[var(--muted)] py-8">
                  No kits match filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
