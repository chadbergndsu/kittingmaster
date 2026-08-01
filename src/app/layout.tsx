import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth/session";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-loaded",
  display: "swap",
});

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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
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
