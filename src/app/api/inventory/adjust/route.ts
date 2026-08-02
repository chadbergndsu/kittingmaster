import { NextRequest } from "next/server";
import { z } from "zod";
import { InventoryTxnType } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { jsonError, jsonOk } from "@/lib/api";

/**
 * Cycle count / inventory adjust — core WMS capability for kitting accuracy.
 * Sets on-hand to counted qty (or delta mode).
 */
const schema = z.object({
  siteId: z.string().min(1),
  locationId: z.string().min(1),
  partId: z.string().min(1),
  countedQty: z.number().min(0),
  lotId: z.string().optional(),
  serialId: z.string().optional(),
  reason: z.string().min(2).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["OWNER", "ADMIN", "SUPERVISOR", "PLANNER"].includes(session.role)) {
      throw new DomainError("FORBIDDEN", "Insufficient role for cycle count");
    }
    const body = schema.parse(await req.json());
    const lotId = body.lotId || "";
    const serialId = body.serialId || "";

    const balance = await prisma.inventoryBalance.findUnique({
      where: {
        locationId_partId_lotId_serialId: {
          locationId: body.locationId,
          partId: body.partId,
          lotId,
          serialId,
        },
      },
    });

    const previous = balance?.onHand ?? 0;
    const delta = body.countedQty - previous;

    if (!balance) {
      if (body.countedQty === 0) {
        return jsonOk({ previous: 0, counted: 0, delta: 0 });
      }
      await prisma.inventoryBalance.create({
        data: {
          organizationId: session.organizationId,
          siteId: body.siteId,
          locationId: body.locationId,
          partId: body.partId,
          lotId,
          serialId,
          onHand: body.countedQty,
          reserved: 0,
          staged: 0,
        },
      });
    } else {
      if (body.countedQty < balance.reserved + balance.staged) {
        throw new DomainError(
          "ADJUST_BELOW_HOLDS",
          `Count ${body.countedQty} is below reserved+staged (${balance.reserved + balance.staged})`
        );
      }
      await prisma.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: body.countedQty },
      });
    }

    const txn = await prisma.inventoryTransaction.create({
      data: {
        organizationId: session.organizationId,
        siteId: body.siteId,
        type: InventoryTxnType.ADJUST,
        partId: body.partId,
        qty: delta,
        toLocationId: body.locationId,
        lotId: body.lotId || null,
        serialId: body.serialId || null,
        actorId: session.userId,
        metaJson: JSON.stringify({
          reason: body.reason,
          previous,
          counted: body.countedQty,
          mode: "cycle_count",
        }),
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "CYCLE_COUNT",
        entityType: "InventoryBalance",
        entityId: balance?.id || body.locationId,
        payloadJson: JSON.stringify({
          partId: body.partId,
          previous,
          counted: body.countedQty,
          reason: body.reason,
        }),
      },
    });

    return jsonOk({ previous, counted: body.countedQty, delta, transaction: txn });
  } catch (e) {
    return jsonError(e);
  }
}
