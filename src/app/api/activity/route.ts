import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const events = await prisma.auditEvent.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { name: true, email: true } } },
    });
    return jsonOk({ events });
  } catch (e) {
    return jsonError(e);
  }
}
