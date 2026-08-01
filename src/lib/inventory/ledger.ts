import {
  InventoryTxnType,
  Prisma,
  PrismaClient,
  SerialStatus,
} from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

function lotKey(lotId?: string | null) {
  return lotId || "";
}
function serialKey(serialId?: string | null) {
  return serialId || "";
}

async function getOrCreateBalance(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    locationId: string;
    partId: string;
    lotId?: string | null;
    serialId?: string | null;
  }
) {
  const lotId = lotKey(input.lotId);
  const serialId = serialKey(input.serialId);
  const existing = await db.inventoryBalance.findUnique({
    where: {
      locationId_partId_lotId_serialId: {
        locationId: input.locationId,
        partId: input.partId,
        lotId,
        serialId,
      },
    },
  });
  if (existing) return existing;
  return db.inventoryBalance.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      locationId: input.locationId,
      partId: input.partId,
      lotId,
      serialId,
      onHand: 0,
      reserved: 0,
      staged: 0,
    },
  });
}

export async function applyReceipt(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    locationId: string;
    partId: string;
    qty: number;
    lotId?: string | null;
    serialId?: string | null;
    actorId?: string | null;
  }
) {
  if (input.qty <= 0) throw new Error("Receipt qty must be positive");
  const bal = await getOrCreateBalance(db, input);
  await db.inventoryBalance.update({
    where: { id: bal.id },
    data: { onHand: bal.onHand + input.qty },
  });
  return db.inventoryTransaction.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      type: InventoryTxnType.RECEIPT,
      partId: input.partId,
      qty: input.qty,
      toLocationId: input.locationId,
      lotId: input.lotId || null,
      serialId: input.serialId || null,
      actorId: input.actorId || null,
    },
  });
}

export async function reserveStock(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    locationId: string;
    partId: string;
    qty: number;
    lotId?: string | null;
    serialId?: string | null;
    kitId?: string;
    kitLineId?: string;
    actorId?: string | null;
  }
) {
  const bal = await getOrCreateBalance(db, input);
  const available = bal.onHand - bal.reserved - bal.staged;
  if (available < input.qty) {
    throw new DomainError(
      "INSUFFICIENT_STOCK",
      `Insufficient available stock for part (need ${input.qty}, available ${available})`
    );
  }
  await db.inventoryBalance.update({
    where: { id: bal.id },
    data: { reserved: bal.reserved + input.qty },
  });
  if (input.serialId) {
    await db.serial.update({
      where: { id: input.serialId },
      data: { status: SerialStatus.RESERVED },
    });
  }
  return db.inventoryTransaction.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      type: InventoryTxnType.RESERVE,
      partId: input.partId,
      qty: input.qty,
      fromLocationId: input.locationId,
      lotId: input.lotId || null,
      serialId: input.serialId || null,
      kitId: input.kitId,
      kitLineId: input.kitLineId,
      actorId: input.actorId || null,
    },
  });
}

/** Move reserved stock into staging hold at kit staging cell. */
export async function stageStock(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    fromLocationId: string;
    toLocationId: string;
    partId: string;
    qty: number;
    lotId?: string | null;
    serialId?: string | null;
    kitId: string;
    kitLineId: string;
    actorId?: string | null;
  }
) {
  const from = await getOrCreateBalance(db, {
    ...input,
    locationId: input.fromLocationId,
  });
  if (from.reserved < input.qty && from.onHand - from.staged < input.qty) {
    // Prefer reserved path; fall back to on-hand if not pre-reserved
    if (from.onHand - from.reserved - from.staged < input.qty) {
      throw new DomainError("INSUFFICIENT_STOCK", "Cannot stage — not enough stock");
    }
  }

  // Consume from source
  const useReserved = Math.min(from.reserved, input.qty);
  const useFree = input.qty - useReserved;
  await db.inventoryBalance.update({
    where: { id: from.id },
    data: {
      onHand: from.onHand - input.qty,
      reserved: from.reserved - useReserved,
    },
  });

  // Staging hold on destination (KIT-bound RAW staged)
  const to = await getOrCreateBalance(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    locationId: input.toLocationId,
    partId: input.partId,
    lotId: input.lotId,
    serialId: input.serialId,
  });
  await db.inventoryBalance.update({
    where: { id: to.id },
    data: {
      onHand: to.onHand + input.qty,
      staged: to.staged + input.qty,
    },
  });

  if (input.serialId) {
    await db.serial.update({
      where: { id: input.serialId },
      data: { status: SerialStatus.STAGED, kitLineId: input.kitLineId },
    });
  }

  await db.inventoryTransaction.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      type: InventoryTxnType.PICK,
      partId: input.partId,
      qty: input.qty,
      fromLocationId: input.fromLocationId,
      lotId: input.lotId || null,
      serialId: input.serialId || null,
      kitId: input.kitId,
      kitLineId: input.kitLineId,
      actorId: input.actorId || null,
      metaJson: JSON.stringify({ freeUsed: useFree, reservedUsed: useReserved }),
    },
  });

  return db.inventoryTransaction.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      type: InventoryTxnType.STAGE,
      partId: input.partId,
      qty: input.qty,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      lotId: input.lotId || null,
      serialId: input.serialId || null,
      kitId: input.kitId,
      kitLineId: input.kitLineId,
      actorId: input.actorId || null,
    },
  });
}

/** Close RAW staged holds into sealed KIT ledger (logical SEAL txn). */
export async function sealStagedStock(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    stagingLocationId: string;
    kitId: string;
    actorId?: string | null;
    lines: Array<{
      partId: string;
      qty: number;
      lotId?: string | null;
      serialId?: string | null;
      kitLineId: string;
    }>;
  }
) {
  for (const line of input.lines) {
    const bal = await getOrCreateBalance(db, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      locationId: input.stagingLocationId,
      partId: line.partId,
      lotId: line.lotId,
      serialId: line.serialId,
    });
    if (bal.staged < line.qty || bal.onHand < line.qty) {
      throw new DomainError(
        "SEAL_STOCK_MISMATCH",
        `Staged stock mismatch for part ${line.partId}`
      );
    }
    await db.inventoryBalance.update({
      where: { id: bal.id },
      data: {
        onHand: bal.onHand - line.qty,
        staged: bal.staged - line.qty,
      },
    });
    if (line.serialId) {
      await db.serial.update({
        where: { id: line.serialId },
        data: { status: SerialStatus.CONSUMED },
      });
    }
    await db.inventoryTransaction.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        type: InventoryTxnType.SEAL,
        partId: line.partId,
        qty: line.qty,
        fromLocationId: input.stagingLocationId,
        lotId: line.lotId || null,
        serialId: line.serialId || null,
        kitId: input.kitId,
        kitLineId: line.kitLineId,
        actorId: input.actorId || null,
        metaJson: JSON.stringify({ ledger: "RAW→KIT" }),
      },
    });
  }
}

export class DomainError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DomainError";
  }
}

export async function findBestSource(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    partId: string;
    qty: number;
    preferFefo?: boolean;
  }
) {
  const balances = await db.inventoryBalance.findMany({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      partId: input.partId,
      onHand: { gt: 0 },
    },
    include: { location: { include: { zone: true } } },
  });

  const candidates = balances
    .map((b) => ({
      ...b,
      available: b.onHand - b.reserved - b.staged,
    }))
    .filter((b) => b.available > 0 && b.location.type !== "STAGING_CELL");

  if (candidates.length === 0) return null;

  // FEFO: balances with lot ids first if we can load lots
  const lotIds = candidates.map((c) => c.lotId).filter((id) => id);
  const lots =
    lotIds.length > 0
      ? await db.lot.findMany({ where: { id: { in: lotIds } } })
      : [];
  const lotMap = new Map(lots.map((l) => [l.id, l]));

  candidates.sort((a, b) => {
    if (input.preferFefo !== false) {
      const la = a.lotId ? lotMap.get(a.lotId)?.expiresAt?.getTime() ?? Infinity : Infinity;
      const lb = b.lotId ? lotMap.get(b.lotId)?.expiresAt?.getTime() ?? Infinity : Infinity;
      if (la !== lb) return la - lb;
    }
    return a.location.code.localeCompare(b.location.code);
  });

  const best = candidates[0];
  if (best.available < input.qty) {
    return { ...best, partial: true as const };
  }
  return { ...best, partial: false as const };
}
