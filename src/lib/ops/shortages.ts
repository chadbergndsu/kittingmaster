/**
 * Shortage engine — available free stock vs unmet open demand.
 * Reserved qty is already allocated to open kits, so free = onHand - reserved - staged.
 * Demand for kits that already hold reservations should not double-count:
 * openNeed is reduced by reserved-for-open-demand when provided.
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
  /** Qty already reserved (held) for this line — credits open demand. */
  reservedQty?: number;
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

/** Free stock not held by any kit. */
export function availableOf(b: BalanceInput): number {
  return Math.max(0, b.onHand - b.reserved - b.staged);
}

/**
 * Total physical not yet staged — free + reserved (usable by holders).
 * Used for supply capacity vs open demand.
 */
export function supplyOf(b: BalanceInput): number {
  return Math.max(0, b.onHand - b.staged);
}

export function computeShortages(
  balances: BalanceInput[],
  demandLines: DemandLineInput[]
): ShortageRow[] {
  // Total supply (free + reserved) can cover open kits that hold reservations
  const supply = new Map<string, number>();
  for (const b of balances) {
    supply.set(b.partId, (supply.get(b.partId) || 0) + supplyOf(b));
  }

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
    // Unmet need after staging; reserved hold already counts toward coverage
    const remainingAfterStage = Math.max(0, line.requiredQty - line.stagedQty);
    const reserved = Math.max(0, line.reservedQty ?? 0);
    // Net demand still needing free stock
    const need = Math.max(0, remainingAfterStage - reserved);
    if (remainingAfterStage <= 0) continue;

    const cur = byPart.get(line.partId) || {
      sku: line.sku,
      partName: line.partName,
      openDemand: 0,
      blockingKits: [],
    };
    // Open demand for reporting = remaining physical need (including reserved coverage)
    cur.openDemand += remainingAfterStage;
    if (need > 0) {
      cur.blockingKits.push({
        kitId: line.kitId,
        kitInstanceCode: line.kitInstanceCode,
        need: remainingAfterStage,
        status: line.kitStatus,
        dueAt: line.dueAt?.toISOString() ?? null,
      });
    }
    byPart.set(line.partId, cur);
  }

  const rows: ShortageRow[] = [];
  for (const [partId, d] of byPart) {
    const available = supply.get(partId) || 0;
    const shortBy = Math.max(0, d.openDemand - available);
    // WARN only when free margin is thin but not short (within 10% buffer of exact cover)
    const severity: ShortageRow["severity"] =
      shortBy > 0 ? "CRITICAL" : available < d.openDemand * 1.1 && d.openDemand > 0 ? "WARN" : "OK";
    rows.push({
      partId,
      sku: d.sku,
      partName: d.partName,
      available,
      openDemand: d.openDemand,
      shortBy,
      blockingKits: d.blockingKits.sort((a, b) => b.need - a.need),
      severity,
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
