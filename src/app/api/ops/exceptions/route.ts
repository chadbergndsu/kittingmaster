import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, requireRole } from "@/lib/auth/session";
import { SUPERVISOR_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { clearKitException, raiseKitException } from "@/lib/ops/exceptions";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const kits = await prisma.kit.findMany({
      where: {
        organizationId: session.organizationId,
        status: "EXCEPTION",
      },
      include: {
        kitDefinition: true,
        demand: true,
        lines: { include: { part: true } },
      },
      orderBy: { exceptionAt: "desc" },
    });
    return jsonOk({ kits });
  } catch (e) {
    return jsonError(e);
  }
}

const raiseSchema = z.object({
  kitId: z.string().min(1),
  reason: z.string().min(3).max(500),
});

const clearSchema = z.object({
  kitId: z.string().min(1),
  action: z.literal("clear"),
  resumeStatus: z.enum(["PICKING", "ALLOCATED", "STAGED"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(SUPERVISOR_ROLES, "Supervisor+ required for exceptions");
    const body = await req.json();

    if (body.action === "clear") {
      const parsed = clearSchema.parse(body);
      const kit = await clearKitException({
        organizationId: session.organizationId,
        kitId: parsed.kitId,
        actorId: session.userId,
        resumeStatus: parsed.resumeStatus,
      });
      return jsonOk({ kit });
    }

    const parsed = raiseSchema.parse(body);
    const kit = await raiseKitException({
      organizationId: session.organizationId,
      kitId: parsed.kitId,
      reason: parsed.reason,
      actorId: session.userId,
    });
    return jsonOk({ kit });
  } catch (e) {
    return jsonError(e);
  }
}
