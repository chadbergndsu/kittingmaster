"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="login-shell">
      <section className="login-hero">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="brand-mark">KM</div>
            <div>
              <div className="font-semibold tracking-tight">KittingMaster</div>
              <div className="text-xs text-[var(--muted)]">Production kitting control plane</div>
            </div>
          </div>

          <div className="page-kicker">Manufacturing · Assembly · Fulfillment</div>
          <h1 className="page-title mt-3 max-w-xl">
            Stage every component.
            <br />
            <span className="text-sky-300">Seal every kit.</span>
          </h1>
          <p className="page-subtitle mt-4">
            Dual-ledger inventory, scan-order grammar, and per-customer Method DNA — built for
            operators who need speed without losing traceability.
          </p>
        </div>

        <div className="feature-grid max-w-lg">
          <div className="feature-item">
            <div className="nav-icon">1</div>
            <div>
              <strong>Dual-ledger inventory</strong>
              <span>
                RAW components and sealed KIT instances stay honest through every transfer.
              </span>
            </div>
          </div>
          <div className="feature-item">
            <div className="nav-icon">2</div>
            <div>
              <strong>Kit Seal fingerprint</strong>
              <span>
                BOM + lot/serial + staging cell + DNA version bound into one seal artifact.
              </span>
            </div>
          </div>
          <div className="feature-item">
            <div className="nav-icon">3</div>
            <div>
              <strong>Customer Method DNA</strong>
              <span>
                Each tenant runs proprietary staging & validation methods — isolated and exportable.
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="feature-chip">Lot + serial ready</span>
          <span className="feature-chip">Multi-site SaaS</span>
          <span className="feature-chip">Scan wedge optimized</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="card w-full max-w-[420px]">
          <div className="card-body !p-8">
            <div className="mb-7">
              <div className="page-kicker">Secure access</div>
              <h2 className="text-xl font-bold tracking-tight mt-2">Sign in to your floor</h2>
              <p className="text-sm text-[var(--muted)] mt-1.5">
                Use your organization credentials to open the command board.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="field-label">Email</label>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="field-label">Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <button className="btn btn-primary w-full py-3" disabled={loading} type="submit">
                {loading ? "Authenticating…" : "Enter command board"}
              </button>
            </form>

            {process.env.NODE_ENV !== "production" && (
              <div className="mt-6 pt-5 border-t border-[var(--border)] text-xs text-[var(--muted)]">
                <div className="font-semibold text-[var(--text-secondary)] mb-1">
                  Local demo (dev only)
                </div>
                <div className="mono text-sky-200/90">demo@kittingmaster.app</div>
                <div className="mono text-sky-200/90">demo1234</div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
