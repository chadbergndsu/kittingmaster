import { NextRequest } from "next/server";
import { z } from "zod";
import { InventoryTxnType } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { SUPERVISOR_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { jsonError, jsonOk } from "@/lib/api";

/**
 * Cycle count / inventory adjust — sets on-hand to counted qty.
 * Always verifies site/location/part belong to the session organization.
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
    const session = await requireRole(SUPERVISOR_ROLES, "Insufficient role for cycle count");
    const body = schema.parse(await req.json());
    const lotId = body.lotId || "";
    const serialId = body.serialId || "";

    const site = await prisma.site.findFirst({
      where: { id: body.siteId, organizationId: session.organizationId },
    });
    if (!site) throw new DomainError("NOT_FOUND", "Site not found");

    const part = await prisma.part.findFirst({
      where: { id: body.partId, organizationId: session.organizationId },
    });
    if (!part) throw new DomainError("NOT_FOUND", "Part not found");

    const location = await prisma.location.findFirst({
      where: {
        id: body.locationId,
        zone: { site: { id: body.siteId, organizationId: session.organizationId } },
      },
    });
    if (!location) throw new DomainError("NOT_FOUND", "Location not found for site");

    if (body.lotId) {
      const lot = await prisma.lot.findFirst({
        where: { id: body.lotId, organizationId: session.organizationId, partId: body.partId },
      });
      if (!lot) throw new DomainError("NOT_FOUND", "Lot not found");
    }
    if (body.serialId) {
      const serial = await prisma.serial.findFirst({
        where: {
          id: body.serialId,
          organizationId: session.organizationId,
          partId: body.partId,
        },
      });
      if (!serial) throw new DomainError("NOT_FOUND", "Serial not found");
    }

    const result = await prisma.$transaction(async (tx) => {
      const balance = await tx.inventoryBalance.findFirst({
        where: {
          organizationId: session.organizationId,
          locationId: body.locationId,
          partId: body.partId,
          lotId,
          serialId,
        },
      });

      const previous = balance?.onHand ?? 0;
      const delta = body.countedQty - previous;

      if (!balance) {
        if (body.countedQty === 0) {
          return { previous: 0, counted: 0, delta: 0, txn: null as null };
        }
        const created = await tx.inventoryBalance.create({
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
        const txn = await tx.inventoryTransaction.create({
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
        await tx.auditEvent.create({
          data: {
            organizationId: session.organizationId,
            actorId: session.userId,
            action: "CYCLE_COUNT",
            entityType: "InventoryBalance",
            entityId: created.id,
            payloadJson: JSON.stringify({
              partId: body.partId,
              previous,
              counted: body.countedQty,
              reason: body.reason,
            }),
          },
        });
        return { previous, counted: body.countedQty, delta, txn };
      }

      if (body.countedQty < balance.reserved + balance.staged) {
        throw new DomainError(
          "ADJUST_BELOW_HOLDS",
          `Count ${body.countedQty} is below reserved+staged (${balance.reserved + balance.staged})`
        );
      }
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: body.countedQty },
      });
      const txn = await tx.inventoryTransaction.create({
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
      await tx.auditEvent.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.userId,
          action: "CYCLE_COUNT",
          entityType: "InventoryBalance",
          entityId: balance.id,
          payloadJson: JSON.stringify({
            partId: body.partId,
            previous,
            counted: body.countedQty,
            reason: body.reason,
          }),
        },
      });
      return { previous, counted: body.countedQty, delta, txn };
    });

    return jsonOk({
      previous: result.previous,
      counted: result.counted,
      delta: result.delta,
      transaction: result.txn,
    });
  } catch (e) {
    return jsonError(e);
  }
}
