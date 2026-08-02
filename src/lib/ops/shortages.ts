/**
 * Shortage engine — market-critical for kitting (kits blocked when components missing).
 * Computes available RAW (onHand - reserved - staged) vs open kit demand.
 */

export type BalanceInput = {
  partId: string;
  onHand: number;
  reserved: number;
  staged: number;
};

export type DemandLineInput = {
  kitId: string;
  kitInstanceCode: string;
  kitStatus: string;
  partId: string;
  sku: string;
  partName: string;
  requiredQty: number;
  stagedQty: number;
  dueAt?: Date | null;
  priority?: number;
};

export type ShortageRow = {
  partId: string;
  sku: string;
  partName: string;
  available: number;
  openDemand: number;
  shortBy: number;
  blockingKits: Array<{
    kitId: string;
    kitInstanceCode: string;
    need: number;
    status: string;
    dueAt?: string | null;
  }>;
  severity: "CRITICAL" | "WARN" | "OK";
};

export function availableOf(b: BalanceInput): number {
  return Math.max(0, b.onHand - b.reserved - b.staged);
}

export function computeShortages(
  balances: BalanceInput[],
  demandLines: DemandLineInput[]
): ShortageRow[] {
  const avail = new Map<string, number>();
  for (const b of balances) {
    avail.set(b.partId, (avail.get(b.partId) || 0) + availableOf(b));
  }

  // Only open kit demand (not sealed/released/cancelled)
  const openStatuses = new Set([
    "PENDING",
    "ALLOCATED",
    "PICKING",
    "STAGED",
    "VALIDATING",
    "EXCEPTION",
  ]);

  const byPart = new Map<
    string,
    {
      sku: string;
      partName: string;
      openDemand: number;
      blockingKits: ShortageRow["blockingKits"];
    }
  >();

  for (const line of demandLines) {
    if (!openStatuses.has(line.kitStatus)) continue;
    const need = Math.max(0, line.requiredQty - line.stagedQty);
    if (need <= 0) continue;

    const cur = byPart.get(line.partId) || {
      sku: line.sku,
      partName: line.partName,
      openDemand: 0,
      blockingKits: [],
    };
    cur.openDemand += need;
    cur.blockingKits.push({
      kitId: line.kitId,
      kitInstanceCode: line.kitInstanceCode,
      need,
      status: line.kitStatus,
      dueAt: line.dueAt?.toISOString() ?? null,
    });
    byPart.set(line.partId, cur);
  }

  const rows: ShortageRow[] = [];
  for (const [partId, d] of byPart) {
    const available = avail.get(partId) || 0;
    const shortBy = Math.max(0, d.openDemand - available);
    rows.push({
      partId,
      sku: d.sku,
      partName: d.partName,
      available,
      openDemand: d.openDemand,
      shortBy,
      blockingKits: d.blockingKits.sort((a, b) => b.need - a.need),
      severity: shortBy > 0 ? "CRITICAL" : available < d.openDemand * 1.1 ? "WARN" : "OK",
    });
  }

  return rows
    .filter((r) => r.severity !== "OK" || r.openDemand > 0)
    .sort((a, b) => b.shortBy - a.shortBy || b.openDemand - a.openDemand);
}

export function feefoRiskLots(
  lots: Array<{ lotNumber: string; partSku: string; expiresAt: Date | null; qty: number }>
): Array<{ lotNumber: string; partSku: string; expiresAt: string; daysLeft: number; qty: number }> {
  const now = Date.now();
  const day = 86400000;
  return lots
    .filter((l) => l.expiresAt)
    .map((l) => {
      const exp = l.expiresAt!.getTime();
      const daysLeft = Math.ceil((exp - now) / day);
      return {
        lotNumber: l.lotNumber,
        partSku: l.partSku,
        expiresAt: l.expiresAt!.toISOString(),
        daysLeft,
        qty: l.qty,
      };
    })
    .filter((l) => l.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
