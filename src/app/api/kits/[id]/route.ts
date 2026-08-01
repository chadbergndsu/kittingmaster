import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const kit = await prisma.kit.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        kitDefinition: true,
        demand: true,
        stagingLocation: true,
        lines: { include: { part: true, stagedSerials: true } },
        dnaVersion: true,
        sealedBy: true,
        documents: { orderBy: { createdAt: "desc" } },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { lot: true, serial: true, part: true },
        },
      },
    });
    if (!kit) return jsonError({ code: "NOT_FOUND", message: "Not found" } as never);
    return jsonOk({ kit });
  } catch (e) {
    return jsonError(e);
  }
}
