import { NextRequest } from "next/server";
import { z } from "zod";
import { TrackingMode } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { applyReceipt, DomainError } from "@/lib/inventory/ledger";
import { jsonError, jsonOk } from "@/lib/api";

const schema = z.object({
  siteId: z.string().min(1),
  locationId: z.string().min(1),
  partId: z.string().min(1),
  qty: z.number().positive(),
  lotNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  expiresAt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

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
    if (!location) throw new DomainError("NOT_FOUND", "Location not found");

    let lotId: string | null = null;
    let serialId: string | null = null;

    const needsLot =
      part.tracking === TrackingMode.LOT || part.tracking === TrackingMode.LOT_AND_SERIAL;
    const needsSerial =
      part.tracking === TrackingMode.SERIAL || part.tracking === TrackingMode.LOT_AND_SERIAL;

    if (needsLot) {
      if (!body.lotNumber) throw new DomainError("LOT_REQUIRED", "Lot number required");
      const lot = await prisma.lot.upsert({
        where: {
          organizationId_partId_lotNumber: {
            organizationId: session.organizationId,
            partId: part.id,
            lotNumber: body.lotNumber,
          },
        },
        create: {
          organizationId: session.organizationId,
          partId: part.id,
          lotNumber: body.lotNumber,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
        update: {},
      });
      lotId = lot.id;
    }

    if (needsSerial) {
      if (!body.serialNumber) throw new DomainError("SERIAL_REQUIRED", "Serial required");
      const existing = await prisma.serial.findFirst({
        where: {
          organizationId: session.organizationId,
          partId: part.id,
          serialNumber: body.serialNumber,
        },
      });
      if (existing && existing.status !== "AVAILABLE") {
        throw new DomainError("SERIAL_IN_USE", "Serial already consumed or reserved");
      }
      const serial =
        existing ??
        (await prisma.serial.create({
          data: {
            organizationId: session.organizationId,
            partId: part.id,
            serialNumber: body.serialNumber,
            lotId,
            status: "AVAILABLE",
          },
        }));
      serialId = serial.id;
      if (body.qty !== 1) {
        throw new DomainError("SERIAL_QTY", "Serial-controlled receipts must be qty 1");
      }
    }

    const txn = await applyReceipt(prisma, {
      organizationId: session.organizationId,
      siteId: body.siteId,
      locationId: body.locationId,
      partId: part.id,
      qty: body.qty,
      lotId,
      serialId,
      actorId: session.userId,
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "INVENTORY_RECEIPT",
        entityType: "Part",
        entityId: part.id,
        payloadJson: JSON.stringify({
          qty: body.qty,
          locationId: body.locationId,
          lotId,
          serialId,
        }),
      },
    });

    return jsonOk({ transaction: txn }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
