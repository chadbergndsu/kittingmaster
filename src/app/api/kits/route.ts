import { NextRequest } from "next/server";
import { z } from "zod";
import { DemandType } from "@prisma/client";
import { requireSession, requireRole } from "@/lib/auth/session";
import { PLANNER_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { createKitDemand } from "@/lib/kits/service";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const kits = await prisma.kit.findMany({
      where: { organizationId: session.organizationId },
      include: {
        kitDefinition: true,
        demand: true,
        stagingLocation: true,
        lines: { include: { part: true } },
        dnaVersion: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return jsonOk({ kits });
  } catch (e) {
    return jsonError(e);
  }
}

const createSchema = z.object({
  siteId: z.string().min(1),
  kitDefinitionId: z.string().min(1),
  demandType: z.enum(["ASSEMBLY_JOB", "FULFILLMENT_ORDER"]),
  externalRef: z.string().min(1),
  priority: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(PLANNER_ROLES, "Planner+ required to create kits");
    const body = createSchema.parse(await req.json());
    const kit = await createKitDemand({
      organizationId: session.organizationId,
      siteId: body.siteId,
      kitDefinitionId: body.kitDefinitionId,
      demandType: body.demandType as DemandType,
      externalRef: body.externalRef,
      actorId: session.userId,
      priority: body.priority,
    });
    return jsonOk({ kit }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
