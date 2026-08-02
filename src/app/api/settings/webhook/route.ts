import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireSession();
    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { webhookUrl: true, name: true, slug: true },
    });
    return jsonOk({ webhookUrl: org?.webhookUrl ?? null, organization: org });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({
  webhookUrl: z.string().url().nullable().or(z.literal("")),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["OWNER", "ADMIN"].includes(session.role)) {
      throw new DomainError("FORBIDDEN", "Only OWNER/ADMIN can set webhooks");
    }
    const body = schema.parse(await req.json());
    const url = body.webhookUrl === "" ? null : body.webhookUrl;
    const org = await prisma.organization.update({
      where: { id: session.organizationId },
      data: { webhookUrl: url },
      select: { webhookUrl: true },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "WEBHOOK_UPDATED",
        entityType: "Organization",
        entityId: session.organizationId,
        payloadJson: JSON.stringify({ webhookUrl: url }),
      },
    });
    return jsonOk({ webhookUrl: org.webhookUrl });
  } catch (e) {
    return jsonError(e);
  }
}
