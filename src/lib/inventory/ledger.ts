import { InventoryTxnType, Prisma, PrismaClient, SerialStatus } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

function lotKey(lotId?: string | null) {
  return lotId || "";
}
function serialKey(serialId?: string | null) {
  return serialId || "";
}

export class DomainError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DomainError";
  }
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
  try {
    return await db.inventoryBalance.upsert({
      where: {
        locationId_partId_lotId_serialId: {
          locationId: input.locationId,
          partId: input.partId,
          lotId,
          serialId,
        },
      },
      create: {
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
      update: {},
    });
  } catch {
    // Concurrent create race — re-read
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
    if (!existing) throw new DomainError("BALANCE_ERROR", "Could not create inventory balance");
    return existing;
  }
}

/** Atomic onHand increment (receipt). */
async function atomicAddOnHand(db: Db, balanceId: string, qty: number) {
  await db.inventoryBalance.update({
    where: { id: balanceId },
    data: { onHand: { increment: qty } },
  });
}

/**
 * Atomic reserve: only if free stock (onHand - reserved - staged) >= qty.
 * Uses raw SQL for predicate so concurrent reserves cannot over-allocate.
 */
async function atomicReserve(db: Db, balanceId: string, qty: number) {
  const rows = await db.$executeRaw`
    UPDATE "InventoryBalance"
    SET reserved = reserved + ${qty}
    WHERE id = ${balanceId}
      AND (onHand - reserved - staged) >= ${qty}
  `;
  if (rows === 0) {
    throw new DomainError("INSUFFICIENT_STOCK", "Insufficient available stock for reserve");
  }
}

/** Atomic stage: consume kit-owned reserved first, then free stock only. */
async function atomicStageFrom(db: Db, balanceId: string, qty: number, useReserved: number) {
  const useFree = qty - useReserved;
  if (useFree < 0 || useReserved < 0) {
    throw new DomainError("INVALID_QTY", "Invalid stage quantities");
  }
  const rows = await db.$executeRaw`
    UPDATE "InventoryBalance"
    SET
      onHand = onHand - ${qty},
      reserved = reserved - ${useReserved}
    WHERE id = ${balanceId}
      AND onHand >= ${qty}
      AND reserved >= ${useReserved}
      AND (onHand - reserved - staged) >= ${useFree}
  `;
  if (rows === 0) {
    throw new DomainError("INSUFFICIENT_STOCK", "Cannot stage — not enough stock");
  }
}

async function atomicAddStaged(db: Db, balanceId: string, qty: number) {
  await db.inventoryBalance.update({
    where: { id: balanceId },
    data: {
      onHand: { increment: qty },
      staged: { increment: qty },
    },
  });
}

async function atomicSealStaged(db: Db, balanceId: string, qty: number) {
  const rows = await db.$executeRaw`
    UPDATE "InventoryBalance"
    SET onHand = onHand - ${qty}, staged = staged - ${qty}
    WHERE id = ${balanceId}
      AND staged >= ${qty}
      AND onHand >= ${qty}
  `;
  if (rows === 0) {
    throw new DomainError("SEAL_STOCK_MISMATCH", "Staged stock mismatch");
  }
}

async function atomicUnreserve(db: Db, balanceId: string, qty: number) {
  const rows = await db.$executeRaw`
    UPDATE "InventoryBalance"
    SET reserved = reserved - ${qty}
    WHERE id = ${balanceId}
      AND reserved >= ${qty}
  `;
  if (rows === 0) {
    throw new DomainError("UNRESERVE_MISMATCH", "Cannot unreserve — reserved qty too low");
  }
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
  if (input.qty <= 0) throw new DomainError("INVALID_QTY", "Receipt qty must be positive");
  if (input.serialId && input.qty !== 1) {
    throw new DomainError("SERIAL_QTY", "Serial-controlled receipts must be qty 1");
  }
  if (input.serialId) {
    const bal = await db.inventoryBalance.findUnique({
      where: {
        locationId_partId_lotId_serialId: {
          locationId: input.locationId,
          partId: input.partId,
          lotId: lotKey(input.lotId),
          serialId: serialKey(input.serialId),
        },
      },
    });
    if (bal && bal.onHand > 0) {
      throw new DomainError("SERIAL_ALREADY_ON_HAND", "Serial already received into inventory");
    }
  }
  const bal = await getOrCreateBalance(db, input);
  await atomicAddOnHand(db, bal.id, input.qty);
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
    kitId: string;
    kitLineId: string;
    actorId?: string | null;
  }
) {
  if (input.qty <= 0) throw new DomainError("INVALID_QTY", "Reserve qty must be positive");
  if (input.serialId && input.qty !== 1) {
    throw new DomainError("SERIAL_QTY", "Serial reserve must be qty 1");
  }

  if (input.serialId) {
    const serial = await db.serial.findUnique({ where: { id: input.serialId } });
    if (!serial || serial.status !== SerialStatus.AVAILABLE) {
      throw new DomainError("SERIAL_IN_USE", "Serial not available for reserve");
    }
  }

  const bal = await getOrCreateBalance(db, input);
  await atomicReserve(db, bal.id, input.qty);

  await db.stockHold.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      locationId: input.locationId,
      partId: input.partId,
      lotId: lotKey(input.lotId),
      serialId: serialKey(input.serialId),
      kitId: input.kitId,
      kitLineId: input.kitLineId,
      qty: input.qty,
      qtyConsumed: 0,
    },
  });

  if (input.serialId) {
    await db.serial.update({
      where: { id: input.serialId },
      data: { status: SerialStatus.RESERVED, kitLineId: input.kitLineId },
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

/** Release remaining kit holds (cancel / unreserve). */
export async function unreserveKitHolds(
  db: Db,
  input: {
    organizationId: string;
    kitId: string;
    actorId?: string | null;
  }
) {
  const holds = await db.stockHold.findMany({
    where: {
      organizationId: input.organizationId,
      kitId: input.kitId,
    },
  });

  for (const hold of holds) {
    const remaining = hold.qty - hold.qtyConsumed;
    if (remaining <= 0) {
      await db.stockHold.delete({ where: { id: hold.id } });
      continue;
    }
    const bal = await getOrCreateBalance(db, {
      organizationId: hold.organizationId,
      siteId: hold.siteId,
      locationId: hold.locationId,
      partId: hold.partId,
      lotId: hold.lotId || null,
      serialId: hold.serialId || null,
    });
    await atomicUnreserve(db, bal.id, remaining);
    if (hold.serialId) {
      await db.serial.updateMany({
        where: {
          id: hold.serialId,
          status: SerialStatus.RESERVED,
        },
        data: { status: SerialStatus.AVAILABLE, kitLineId: null },
      });
    }
    await db.inventoryTransaction.create({
      data: {
        organizationId: hold.organizationId,
        siteId: hold.siteId,
        type: InventoryTxnType.UNRESERVE,
        partId: hold.partId,
        qty: remaining,
        fromLocationId: hold.locationId,
        lotId: hold.lotId || null,
        serialId: hold.serialId || null,
        kitId: hold.kitId,
        kitLineId: hold.kitLineId,
        actorId: input.actorId || null,
      },
    });
    await db.stockHold.delete({ where: { id: hold.id } });
  }
}

/** Move stock into staging hold at kit staging cell. Kit-scoped reserved only. */
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
  if (input.qty <= 0) throw new DomainError("INVALID_QTY", "Stage qty must be positive");
  if (input.serialId && input.qty !== 1) {
    throw new DomainError("SERIAL_QTY", "Serial stage must be qty 1");
  }

  if (input.serialId) {
    const serial = await db.serial.findUnique({ where: { id: input.serialId } });
    if (!serial) throw new DomainError("NOT_FOUND", "Serial not found");
    if (
      serial.status === SerialStatus.CONSUMED ||
      serial.status === SerialStatus.STAGED ||
      (serial.status === SerialStatus.RESERVED &&
        serial.kitLineId &&
        serial.kitLineId !== input.kitLineId)
    ) {
      throw new DomainError("SERIAL_IN_USE", `Serial status ${serial.status} cannot be staged`);
    }
    if (serial.partId !== input.partId) {
      throw new DomainError("SERIAL_PART_MISMATCH", "Serial does not belong to this part");
    }
    if (input.lotId && serial.lotId && serial.lotId !== input.lotId) {
      throw new DomainError("SERIAL_LOT_MISMATCH", "Serial does not match scanned lot");
    }
  }

  const from = await getOrCreateBalance(db, {
    ...input,
    locationId: input.fromLocationId,
  });

  // Kit-scoped hold remaining for this line + identity
  const holds = await db.stockHold.findMany({
    where: {
      kitId: input.kitId,
      kitLineId: input.kitLineId,
      locationId: input.fromLocationId,
      partId: input.partId,
      lotId: lotKey(input.lotId),
      serialId: serialKey(input.serialId),
    },
  });
  let kitReservedLeft = holds.reduce((s, h) => s + (h.qty - h.qtyConsumed), 0);

  // Also match holds without serial key if staging with serial from reserved lot-less hold
  if (kitReservedLeft <= 0 && input.serialId) {
    const broader = await db.stockHold.findMany({
      where: {
        kitId: input.kitId,
        kitLineId: input.kitLineId,
        locationId: input.fromLocationId,
        partId: input.partId,
        lotId: lotKey(input.lotId),
      },
    });
    kitReservedLeft = broader.reduce((s, h) => s + (h.qty - h.qtyConsumed), 0);
  }

  const useReserved = Math.min(kitReservedLeft, input.qty);
  await atomicStageFrom(db, from.id, input.qty, useReserved);

  // Consume holds
  let left = useReserved;
  const holdRows =
    holds.length > 0
      ? holds
      : await db.stockHold.findMany({
          where: {
            kitId: input.kitId,
            kitLineId: input.kitLineId,
            locationId: input.fromLocationId,
            partId: input.partId,
          },
        });
  for (const hold of holdRows) {
    if (left <= 0) break;
    const rem = hold.qty - hold.qtyConsumed;
    if (rem <= 0) continue;
    const take = Math.min(rem, left);
    await db.stockHold.update({
      where: { id: hold.id },
      data: { qtyConsumed: hold.qtyConsumed + take },
    });
    left -= take;
  }

  const to = await getOrCreateBalance(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    locationId: input.toLocationId,
    partId: input.partId,
    lotId: input.lotId,
    serialId: input.serialId,
  });
  await atomicAddStaged(db, to.id, input.qty);

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
      metaJson: JSON.stringify({
        freeUsed: input.qty - useReserved,
        reservedUsed: useReserved,
      }),
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

/** Close RAW staged holds — one seal line per STAGE identity. */
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
    await atomicSealStaged(db, bal.id, line.qty);
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

  // Clear remaining holds for sealed kit
  await db.stockHold.deleteMany({ where: { kitId: input.kitId } });
}

export async function findBestSource(
  db: Db,
  input: {
    organizationId: string;
    siteId: string;
    partId: string;
    qty: number;
    preferFefo?: boolean;
    lotId?: string | null;
    serialId?: string | null;
    /** Prefer location that already has a hold for this kit line */
    preferLocationId?: string | null;
  }
) {
  const now = new Date();
  const balances = await db.inventoryBalance.findMany({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      partId: input.partId,
      onHand: { gt: 0 },
      ...(input.lotId ? { lotId: lotKey(input.lotId) } : {}),
      ...(input.serialId ? { serialId: serialKey(input.serialId) } : {}),
    },
    include: { location: { include: { zone: true } } },
  });

  let candidates = balances
    .map((b) => ({
      ...b,
      available: b.onHand - b.reserved - b.staged,
    }))
    .filter((b) => b.available > 0 && b.location.type !== "STAGING_CELL");

  // FEFO: exclude expired lots
  const lotIds = candidates.map((c) => c.lotId).filter((id) => id);
  const lots = lotIds.length > 0 ? await db.lot.findMany({ where: { id: { in: lotIds } } }) : [];
  const lotMap = new Map(lots.map((l) => [l.id, l]));

  candidates = candidates.filter((c) => {
    if (!c.lotId) return true;
    const lot = lotMap.get(c.lotId);
    if (!lot?.expiresAt) return true;
    return lot.expiresAt.getTime() >= now.getTime();
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (input.preferLocationId) {
      if (a.locationId === input.preferLocationId && b.locationId !== input.preferLocationId)
        return -1;
      if (b.locationId === input.preferLocationId && a.locationId !== input.preferLocationId)
        return 1;
    }
    if (input.preferFefo !== false) {
      const la = a.lotId ? (lotMap.get(a.lotId)?.expiresAt?.getTime() ?? Infinity) : Infinity;
      const lb = b.lotId ? (lotMap.get(b.lotId)?.expiresAt?.getTime() ?? Infinity) : Infinity;
      if (la !== lb) return la - lb;
    }
    // Serial FIFO: smaller serial id first when present
    if (a.serialId && b.serialId && a.serialId !== b.serialId) {
      return a.serialId.localeCompare(b.serialId);
    }
    return a.location.code.localeCompare(b.location.code);
  });

  const best = candidates[0];
  if (best.available < input.qty) {
    return { ...best, partial: true as const };
  }
  return { ...best, partial: false as const };
}

/** Find open hold location for a kit line (prefer staging from reserved bin). */
export async function findHoldSource(
  db: Db,
  input: {
    kitId: string;
    kitLineId: string;
    partId: string;
    lotId?: string | null;
    serialId?: string | null;
  }
) {
  const holds = await db.stockHold.findMany({
    where: {
      kitId: input.kitId,
      kitLineId: input.kitLineId,
      partId: input.partId,
      ...(input.lotId ? { lotId: lotKey(input.lotId) } : {}),
      ...(input.serialId ? { serialId: serialKey(input.serialId) } : {}),
    },
  });
  const open = holds.find((h) => h.qty - h.qtyConsumed > 0);
  return open ?? null;
}
