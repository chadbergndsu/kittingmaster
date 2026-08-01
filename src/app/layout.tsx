import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "KittingMaster",
  description:
    "Stage and kit components with dual-ledger inventory, Kit Seal validation, and Customer Method DNA.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        <AppShell
          user={
            session
              ? {
                  name: session.name,
                  organizationName: session.organizationName,
                  role: session.role,
                }
              : null
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
