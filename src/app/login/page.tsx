"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@kittingmaster.app");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-[80vh] grid place-items-center px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6">
          <div className="text-2xl font-bold tracking-tight">KittingMaster</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            Production kitting foundation with dual-ledger inventory, Kit Seal,
            and per-customer Method DNA.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-[var(--muted)]">Email</label>
            <input
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Password</label>
            <input
              className="input mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-sm text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button className="btn btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-6 text-xs text-[var(--muted)] border-t border-[var(--border)] pt-4">
          Demo: <span className="mono text-sky-200">demo@kittingmaster.app</span> /{" "}
          <span className="mono text-sky-200">demo1234</span>
        </div>
      </div>
    </div>
  );
}
