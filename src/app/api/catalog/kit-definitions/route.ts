import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { DomainError } from "@/lib/inventory/ledger";

const schema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  revision: z.string().default("A"),
  lines: z
    .array(
      z.object({
        partId: z.string().min(1),
        qty: z.number().positive(),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const code = body.code.trim().toUpperCase();

    const existing = await prisma.kitDefinition.findFirst({
      where: {
        organizationId: session.organizationId,
        code,
        revision: body.revision,
      },
    });
    if (existing) {
      throw new DomainError("DUPLICATE_BOM", `Definition ${code} rev ${body.revision} exists`);
    }

    const partIds = body.lines.map((l) => l.partId);
    const parts = await prisma.part.findMany({
      where: { organizationId: session.organizationId, id: { in: partIds } },
    });
    if (parts.length !== new Set(partIds).size) {
      throw new DomainError("INVALID_PART", "One or more parts are invalid");
    }

    const def = await prisma.kitDefinition.create({
      data: {
        organizationId: session.organizationId,
        code,
        name: body.name.trim(),
        revision: body.revision,
        lines: {
          create: body.lines.map((l, i) => ({
            partId: l.partId,
            qty: l.qty,
            sortOrder: i + 1,
          })),
        },
      },
      include: { lines: { include: { part: true }, orderBy: { sortOrder: "asc" } } },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "KIT_DEFINITION_CREATED",
        entityType: "KitDefinition",
        entityId: def.id,
        payloadJson: JSON.stringify({ code: def.code, lines: body.lines.length }),
      },
    });

    return jsonOk({ kitDefinition: def }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
