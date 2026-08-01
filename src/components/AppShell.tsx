"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Board" },
  { href: "/kits", label: "Kits" },
  { href: "/scan", label: "Scan" },
  { href: "/inventory", label: "Inventory" },
  { href: "/catalog", label: "Catalog" },
  { href: "/dna", label: "Method DNA" },
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-black/20 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 grid place-items-center font-black text-slate-950">
              KM
            </div>
            <div>
              <div className="font-semibold tracking-tight">KittingMaster</div>
              <div className="text-xs text-[var(--muted)]">
                Dual-Ledger · Kit Seal · Customer Method DNA
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    active
                      ? "bg-sky-500/20 text-sky-200 border border-sky-500/30"
                      : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <div className="text-right">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {user.organizationName} · {user.role}
                  </div>
                </div>
                <button className="btn" onClick={logout} type="button">
                  Log out
                </button>
              </>
            ) : (
              <Link className="btn btn-primary" href="/login">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
