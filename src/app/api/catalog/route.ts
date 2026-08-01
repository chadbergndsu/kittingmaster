import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const [parts, kitDefinitions, sites, locations] = await Promise.all([
      prisma.part.findMany({
        where: { organizationId: session.organizationId },
        orderBy: { sku: "asc" },
      }),
      prisma.kitDefinition.findMany({
        where: { organizationId: session.organizationId },
        include: { lines: { include: { part: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: { code: "asc" },
      }),
      prisma.site.findMany({
        where: { organizationId: session.organizationId },
        orderBy: { code: "asc" },
      }),
      prisma.location.findMany({
        where: { zone: { site: { organizationId: session.organizationId } } },
        include: { zone: { include: { site: true } } },
        orderBy: { code: "asc" },
      }),
    ]);
    return jsonOk({ parts, kitDefinitions, sites, locations });
  } catch (e) {
    return jsonError(e);
  }
}
