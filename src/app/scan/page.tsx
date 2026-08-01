import { Suspense } from "react";
import { ScanClient } from "./ScanClient";

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading scan console…</div>}>
      <ScanClient />
    </Suspense>
  );
}
