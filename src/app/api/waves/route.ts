import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/auth/session";
import { PLANNER_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { createWave } from "@/lib/ops/waves";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const waves = await prisma.wave.findMany({
      where: { organizationId: session.organizationId },
      include: {
        site: true,
        kits: {
          include: {
            kit: { include: { kitDefinition: true, demand: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk({ waves });
  } catch (e) {
    return jsonError(e);
  }
}

const createSchema = z.object({
  siteId: z.string().min(1),
  kitIds: z.array(z.string()).min(1),
  name: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(PLANNER_ROLES, "Planner+ required to create waves");
    const body = createSchema.parse(await req.json());
    const wave = await createWave({
      organizationId: session.organizationId,
      siteId: body.siteId,
      kitIds: body.kitIds,
      name: body.name,
      notes: body.notes,
      actorId: session.userId,
    });
    return jsonOk({ wave }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
