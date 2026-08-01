import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { KitStatus } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireSession();
    const kits = await prisma.kit.groupBy({
      by: ["status"],
      where: { organizationId: session.organizationId },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      (Object.keys(KitStatus) as KitStatus[]).map((s) => [s, 0])
    ) as Record<KitStatus, number>;
    for (const row of kits) {
      counts[row.status] = row._count._all;
    }
    const recent = await prisma.kit.findMany({
      where: { organizationId: session.organizationId },
      include: {
        kitDefinition: true,
        demand: true,
        stagingLocation: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });
    return jsonOk({ counts, recent, serverTime: new Date().toISOString() });
  } catch (e) {
    return jsonError(e);
  }
}
