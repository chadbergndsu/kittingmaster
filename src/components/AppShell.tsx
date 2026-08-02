"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const opsNav = [
  { href: "/dashboard", label: "Command board", icon: "◉" },
  { href: "/kits", label: "Kits", icon: "▣" },
  { href: "/scan", label: "Scan console", icon: "〉" },
];

const systemNav = [
  { href: "/inventory", label: "Dual ledger", icon: "≡" },
  { href: "/catalog", label: "Catalog", icon: "▤" },
  { href: "/dna", label: "Method DNA", icon: "◈" },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: {
    name: string;
    organizationName: string;
    role: string;
  } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const initials = (user?.name || "KM")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="flex items-center gap-3 px-2 pt-1">
          <div className="brand-mark">KM</div>
          <div className="min-w-0">
            <div className="font-semibold tracking-tight text-[0.95rem]">KittingMaster</div>
            <div className="text-[0.7rem] text-[var(--muted)] truncate">
              Dual-ledger ops platform
            </div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-emerald-300/90 mt-1">
              Customized view ·{" "}
              {user?.role
                ? String(user.role).replaceAll("_", " ").toLowerCase()
                : "operations"}
            </div>
          </div>
        </div>

        <div className="px-1">
          <div className="rounded-xl border border-[var(--border)] bg-white/[0.02] px-3 py-2.5">
            <div className="text-[0.65rem] uppercase tracking-[0.1em] text-[var(--muted)] font-bold">
              Tenant
            </div>
            <div className="text-sm font-medium truncate mt-0.5">
              {user?.organizationName || "—"}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-emerald-300/90">
              <span className="live-dot" />
              Systems online
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-4 flex-1">
          <div>
            <div className="nav-section-label">Operations</div>
            <div className="flex flex-col gap-0.5">
              {opsNav.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${active ? "active" : ""}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div>
            <div className="nav-section-label">System</div>
            <div className="flex flex-col gap-0.5">
              {systemNav.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${active ? "active" : ""}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="mt-auto px-1 space-y-2">
          <div className="rounded-xl border border-[var(--border)] p-3 bg-gradient-to-br from-sky-500/10 to-violet-500/10">
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-sky-200/90">
              Platform IP
            </div>
            <div className="text-[0.75rem] text-[var(--muted)] mt-1 leading-relaxed">
              Kit Seal · Method DNA · Scan grammar
            </div>
          </div>
        </div>
      </aside>

      <div className="main-canvas">
        <header className="topbar">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="badge">
                <span className="live-dot" />
                LIVE
              </span>
              <span className="truncate">Floor control · multi-site ready</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <div className="user-chip">
                  <div className="avatar">{initials}</div>
                  <div className="pr-2 hidden sm:block">
                    <div className="text-xs font-semibold leading-tight">{user.name}</div>
                    <div className="text-[0.65rem] text-[var(--muted)] mono leading-tight">
                      {user.role}
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={logout} type="button">
                  Sign out
                </button>
              </>
            ) : (
              <Link className="btn btn-primary" href="/login">
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
