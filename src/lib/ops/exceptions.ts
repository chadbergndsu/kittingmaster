import { KitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { dispatchWebhook } from "@/lib/ops/webhooks";

export async function raiseKitException(input: {
  organizationId: string;
  kitId: string;
  reason: string;
  actorId?: string;
}) {
  const kit = await prisma.kit.findFirst({
    where: { id: input.kitId, organizationId: input.organizationId },
  });
  if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
  if (["SEALED", "RELEASED", "CANCELLED"].includes(kit.status)) {
    throw new DomainError("INVALID_STATUS", `Cannot exception kit in ${kit.status}`);
  }

  const updated = await prisma.kit.update({
    where: { id: kit.id },
    data: {
      status: KitStatus.EXCEPTION,
      exceptionReason: input.reason.slice(0, 500),
      exceptionAt: new Date(),
    },
    include: { kitDefinition: true, demand: true },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "KIT_EXCEPTION",
      entityType: "Kit",
      entityId: kit.id,
      payloadJson: JSON.stringify({ reason: input.reason }),
    },
  });

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
  });
  await dispatchWebhook(org?.webhookUrl, {
    event: "kit.exception",
    organizationId: input.organizationId,
    occurredAt: new Date().toISOString(),
    data: {
      kitId: kit.id,
      kitInstanceCode: kit.kitInstanceCode,
      reason: input.reason,
    },
  });

  return updated;
}

export async function clearKitException(input: {
  organizationId: string;
  kitId: string;
  actorId?: string;
  resumeStatus?: "PICKING" | "ALLOCATED" | "STAGED";
}) {
  const kit = await prisma.kit.findFirst({
    where: { id: input.kitId, organizationId: input.organizationId },
  });
  if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
  if (kit.status !== KitStatus.EXCEPTION) {
    throw new DomainError("INVALID_STATUS", "Kit is not in EXCEPTION");
  }

  const resume = input.resumeStatus || KitStatus.PICKING;
  const updated = await prisma.kit.update({
    where: { id: kit.id },
    data: {
      status: resume,
      exceptionReason: null,
      exceptionAt: null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "KIT_EXCEPTION_CLEARED",
      entityType: "Kit",
      entityId: kit.id,
      payloadJson: JSON.stringify({ resume }),
    },
  });

  return updated;
}
