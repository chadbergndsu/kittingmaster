import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { hashDnaContent } from "@/lib/dna/defaults";
import { jsonError, jsonOk } from "@/lib/api";
import { DomainError } from "@/lib/inventory/ledger";

const schema = z.object({
  version: z.string().min(1).optional(),
  strategies: z.record(z.string(), z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function bumpPatch(version: string): string {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return `${version}.1`;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["OWNER", "ADMIN"].includes(session.role)) {
      throw new DomainError("FORBIDDEN", "Only OWNER/ADMIN can publish Method DNA");
    }

    const body = schema.parse(await req.json().catch(() => ({})));
    const dna = await prisma.methodDna.findFirst({
      where: { organizationId: session.organizationId, isDefault: true },
      include: {
        versions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!dna?.versions[0]) throw new DomainError("DNA_MISSING", "No Method DNA found");

    const prev = dna.versions[0];
    const strategies = body.strategies ?? (JSON.parse(prev.strategiesJson) as Record<string, string>);
    const config = body.config ?? (JSON.parse(prev.configJson) as Record<string, unknown>);
    const version = body.version ?? bumpPatch(prev.version);
    const contentHash = hashDnaContent(strategies, config);

    const published = await prisma.methodDnaVersion.create({
      data: {
        methodDnaId: dna.id,
        version,
        isPublished: true,
        publishedAt: new Date(),
        strategiesJson: JSON.stringify(strategies),
        configJson: JSON.stringify(config),
        contentHash,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "DNA_PUBLISHED",
        entityType: "MethodDnaVersion",
        entityId: published.id,
        payloadJson: JSON.stringify({ version, contentHash }),
      },
    });

    return jsonOk({ version: published }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
