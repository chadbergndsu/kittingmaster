import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { PLANNER_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { DomainError } from "@/lib/inventory/ledger";

const schema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  uom: z.string().default("EA"),
  tracking: z.enum(["NONE", "LOT", "SERIAL", "LOT_AND_SERIAL"]).default("NONE"),
  barcode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(PLANNER_ROLES, "Planner+ required to create parts");
    const body = schema.parse(await req.json());
    const sku = body.sku.trim().toUpperCase();

    const existing = await prisma.part.findFirst({
      where: { organizationId: session.organizationId, sku },
    });
    if (existing) throw new DomainError("DUPLICATE_SKU", `SKU ${sku} already exists`);

    const part = await prisma.part.create({
      data: {
        organizationId: session.organizationId,
        sku,
        name: body.name.trim(),
        uom: body.uom,
        tracking: body.tracking,
        barcode: body.barcode?.trim() || sku,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "PART_CREATED",
        entityType: "Part",
        entityId: part.id,
        payloadJson: JSON.stringify({ sku: part.sku, tracking: part.tracking }),
      },
    });

    return jsonOk({ part }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
