import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { assertSafeWebhookUrl, generateWebhookSecret } from "@/lib/ops/webhooks";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireRole(ADMIN_ROLES, "Only OWNER/ADMIN can view webhook settings");
    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { webhookUrl: true, webhookSecret: true, name: true, slug: true },
    });
    return jsonOk({
      webhookUrl: org?.webhookUrl ?? null,
      hasSecret: Boolean(org?.webhookSecret),
      organization: { name: org?.name, slug: org?.slug },
    });
  } catch (e) {
    return jsonError(e);
  }
}

const schema = z.object({
  webhookUrl: z.string().url().nullable().or(z.literal("")),
  rotateSecret: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole(ADMIN_ROLES, "Only OWNER/ADMIN can set webhooks");
    const body = schema.parse(await req.json());
    let url: string | null = body.webhookUrl === "" ? null : body.webhookUrl;
    if (url) {
      try {
        url = await assertSafeWebhookUrl(url);
      } catch (err) {
        throw new DomainError(
          "INVALID_WEBHOOK",
          err instanceof Error ? err.message : "Invalid webhook URL"
        );
      }
    }

    const existing = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { webhookSecret: true },
    });

    let webhookSecret = existing?.webhookSecret ?? null;
    if (url && (!webhookSecret || body.rotateSecret)) {
      webhookSecret = generateWebhookSecret();
    }
    if (!url) webhookSecret = null;

    const org = await prisma.organization.update({
      where: { id: session.organizationId },
      data: { webhookUrl: url, webhookSecret },
      select: { webhookUrl: true, webhookSecret: true },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "WEBHOOK_UPDATED",
        entityType: "Organization",
        entityId: session.organizationId,
        // Do not store full URL with secrets; redacted host only
        payloadJson: JSON.stringify({
          configured: Boolean(url),
          host: url ? new URL(url).host : null,
          secretRotated: Boolean(body.rotateSecret || (url && !existing?.webhookSecret)),
        }),
      },
    });
    return jsonOk({
      webhookUrl: org.webhookUrl,
      hasSecret: Boolean(org.webhookSecret),
      // Return secret once on create/rotate so operator can configure ERP
      webhookSecret:
        body.rotateSecret || (url && !existing?.webhookSecret) ? org.webhookSecret : undefined,
    });
  } catch (e) {
    return jsonError(e);
  }
}
