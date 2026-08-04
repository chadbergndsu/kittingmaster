import { KitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { dispatchWebhook } from "@/lib/ops/webhooks";

const RESUMABLE: KitStatus[] = [
  KitStatus.PENDING,
  KitStatus.ALLOCATED,
  KitStatus.PICKING,
  KitStatus.STAGED,
];

function resumeFromLines(lines: Array<{ stagedQty: number; requiredQty: number; status: string }>) {
  if (lines.length === 0) return KitStatus.PENDING;
  const allComplete = lines.every((l) => l.stagedQty + 1e-9 >= l.requiredQty);
  if (allComplete) return KitStatus.STAGED;
  const any = lines.some((l) => l.stagedQty > 0);
  if (any) return KitStatus.PICKING;
  return KitStatus.ALLOCATED;
}

export async function raiseKitException(input: {
  organizationId: string;
  kitId: string;
  reason: string;
  actorId?: string;
}) {
  return prisma
    .$transaction(async (tx) => {
      const kit = await tx.kit.findFirst({
        where: { id: input.kitId, organizationId: input.organizationId },
      });
      if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
      if (["SEALED", "RELEASED", "CANCELLED", "EXCEPTION"].includes(kit.status)) {
        throw new DomainError("INVALID_STATUS", `Cannot exception kit in ${kit.status}`);
      }

      const updated = await tx.kit.update({
        where: { id: kit.id },
        data: {
          statusBeforeException: kit.status,
          status: KitStatus.EXCEPTION,
          exceptionReason: input.reason.slice(0, 500),
          exceptionAt: new Date(),
        },
        include: { kitDefinition: true, demand: true },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: "KIT_EXCEPTION",
          entityType: "Kit",
          entityId: kit.id,
          payloadJson: JSON.stringify({
            reason: input.reason,
            previousStatus: kit.status,
          }),
        },
      });

      return updated;
    })
    .then(async (updated) => {
      const org = await prisma.organization.findUnique({
        where: { id: input.organizationId },
      });
      const result = await dispatchWebhook(
        org?.webhookUrl,
        {
          event: "kit.exception",
          organizationId: input.organizationId,
          occurredAt: new Date().toISOString(),
          data: {
            kitId: updated.id,
            kitInstanceCode: updated.kitInstanceCode,
            reason: input.reason,
          },
        },
        org?.webhookSecret
      );
      if (!result.ok) {
        await prisma.auditEvent.create({
          data: {
            organizationId: input.organizationId,
            action: "WEBHOOK_FAILED",
            entityType: "Kit",
            entityId: updated.id,
            payloadJson: JSON.stringify({ event: "kit.exception", error: result.error }),
          },
        });
      }
      return updated;
    });
}

export async function clearKitException(input: {
  organizationId: string;
  kitId: string;
  actorId?: string;
  resumeStatus?: "PICKING" | "ALLOCATED" | "STAGED";
}) {
  return prisma.$transaction(async (tx) => {
    const kit = await tx.kit.findFirst({
      where: { id: input.kitId, organizationId: input.organizationId },
      include: { lines: true },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
    if (kit.status !== KitStatus.EXCEPTION) {
      throw new DomainError("INVALID_STATUS", "Kit is not in EXCEPTION");
    }

    let resume: KitStatus;
    if (input.resumeStatus) {
      resume = input.resumeStatus as KitStatus;
      if (!RESUMABLE.includes(resume)) {
        throw new DomainError("INVALID_STATUS", "Invalid resume status");
      }
    } else if (
      kit.statusBeforeException &&
      RESUMABLE.includes(kit.statusBeforeException as KitStatus)
    ) {
      resume = kit.statusBeforeException as KitStatus;
    } else {
      resume = resumeFromLines(kit.lines);
    }

    const updated = await tx.kit.update({
      where: { id: kit.id },
      data: {
        status: resume,
        statusBeforeException: null,
        exceptionReason: null,
        exceptionAt: null,
      },
    });

    await tx.auditEvent.create({
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
  });
}
