import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeOpsMetrics } from "@/lib/ops/metrics";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const kits = await prisma.kit.findMany({
      where: { organizationId: session.organizationId },
      include: { demand: true },
    });

    const metrics = computeOpsMetrics(
      kits.map((k) => ({
        id: k.id,
        status: k.status,
        createdAt: k.createdAt,
        sealedAt: k.sealedAt,
        updatedAt: k.updatedAt,
        demandType: k.demand?.type,
        priority: k.demand?.priority,
        dueAt: k.demand?.dueAt,
      }))
    );

    const recentSeals = kits
      .filter((k) => k.sealedAt)
      .sort((a, b) => (b.sealedAt!.getTime() - a.sealedAt!.getTime()))
      .slice(0, 8)
      .map((k) => ({
        id: k.id,
        code: k.kitInstanceCode,
        sealedAt: k.sealedAt,
        seal: k.sealFingerprint?.slice(0, 12),
      }));

    return jsonOk({ metrics, recentSeals });
  } catch (e) {
    return jsonError(e);
  }
}
