import { requireSession, requireRole } from "@/lib/auth/session";
import { EXPORT_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { exportDnaPack } from "@/lib/dna/defaults";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const dnas = await prisma.methodDna.findMany({
      where: { organizationId: session.organizationId },
      include: {
        versions: { orderBy: { createdAt: "desc" } },
      },
    });
    return jsonOk({ dnas });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST() {
  try {
    const session = await requireRole(EXPORT_ROLES, "Insufficient role to export Method DNA");
    const dna = await prisma.methodDna.findFirst({
      where: { organizationId: session.organizationId, isDefault: true },
      include: {
        versions: {
          where: { isPublished: true },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
        organization: true,
      },
    });
    if (!dna?.versions[0]) {
      return jsonError(Object.assign(new Error("No DNA"), { code: "DNA_MISSING" }));
    }
    const v = dna.versions[0];
    const pack = exportDnaPack({
      organizationSlug: dna.organization.slug,
      organizationName: dna.organization.name,
      dnaName: dna.name,
      version: v.version,
      strategies: JSON.parse(v.strategiesJson),
      config: JSON.parse(v.configJson),
      contentHash: v.contentHash,
      publishedAt: v.publishedAt?.toISOString() ?? null,
    });
    return jsonOk({ pack });
  } catch (e) {
    return jsonError(e);
  }
}
