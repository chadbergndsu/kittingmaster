import {
  DemandType,
  DocumentType,
  KitLineStatus,
  KitStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DomainError,
  findBestSource,
  reserveStock,
  sealStagedStock,
  stageStock,
} from "@/lib/inventory/ledger";
import {
  computeKitSealFingerprint,
  shortSealCode,
  type SealLine,
} from "@/lib/seal/fingerprint";

type Db = PrismaClient | Prisma.TransactionClient;

function kitCode(prefix: string) {
  const n = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `${prefix}-${n}`;
}

export async function getPublishedDnaVersion(organizationId: string) {
  const dna = await prisma.methodDna.findFirst({
    where: { organizationId, isDefault: true },
    include: {
      versions: {
        where: { isPublished: true },
        orderBy: { publishedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!dna?.versions[0]) {
    throw new DomainError("DNA_MISSING", "No published Method DNA for organization");
  }
  return dna.versions[0];
}

export async function createKitDemand(input: {
  organizationId: string;
  siteId: string;
  kitDefinitionId: string;
  demandType: DemandType;
  externalRef: string;
  actorId?: string;
  dueAt?: Date;
  priority?: number;
}) {
  const def = await prisma.kitDefinition.findFirst({
    where: { id: input.kitDefinitionId, organizationId: input.organizationId },
    include: { lines: { include: { part: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!def) throw new DomainError("NOT_FOUND", "Kit definition not found");
  if (def.lines.length === 0) throw new DomainError("EMPTY_BOM", "Kit definition has no lines");

  const dnaVersion = await getPublishedDnaVersion(input.organizationId);

  return prisma.$transaction(async (tx) => {
    const demand = await tx.demand.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        type: input.demandType,
        externalRef: input.externalRef,
        dueAt: input.dueAt,
        priority: input.priority ?? 50,
        status: "IN_PROGRESS",
      },
    });

    const kit = await tx.kit.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        kitDefinitionId: def.id,
        demandId: demand.id,
        dnaVersionId: dnaVersion.id,
        status: KitStatus.PENDING,
        kitInstanceCode: kitCode(def.code),
        lines: {
          create: def.lines.map((l) => ({
            partId: l.partId,
            requiredQty: l.qty,
            stagedQty: 0,
            status: KitLineStatus.OPEN,
          })),
        },
      },
      include: {
        lines: { include: { part: true } },
        kitDefinition: true,
        demand: true,
        dnaVersion: true,
      },
    });

    // Allocate / reserve
    let allAllocated = true;
    for (const line of kit.lines) {
      const source = await findBestSource(tx, {
        organizationId: input.organizationId,
        siteId: input.siteId,
        partId: line.partId,
        qty: line.requiredQty,
        preferFefo: true,
      });
      if (!source || source.partial) {
        allAllocated = false;
        continue;
      }
      await reserveStock(tx, {
        organizationId: input.organizationId,
        siteId: input.siteId,
        locationId: source.locationId,
        partId: line.partId,
        qty: line.requiredQty,
        lotId: source.lotId || null,
        serialId: source.serialId || null,
        kitId: kit.id,
        kitLineId: line.id,
        actorId: input.actorId,
      });
    }

    const updated = await tx.kit.update({
      where: { id: kit.id },
      data: { status: allAllocated ? KitStatus.ALLOCATED : KitStatus.PENDING },
      include: {
        lines: { include: { part: true } },
        kitDefinition: true,
        demand: true,
        dnaVersion: true,
        site: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "KIT_CREATED",
        entityType: "Kit",
        entityId: kit.id,
        payloadJson: JSON.stringify({
          kitInstanceCode: kit.kitInstanceCode,
          demandType: input.demandType,
          allocated: allAllocated,
          dnaVersionId: dnaVersion.id,
        }),
      },
    });

    return updated;
  });
}

export async function stagePartOnKit(input: {
  organizationId: string;
  kitId: string;
  stagingLocationId: string;
  partId: string;
  qty: number;
  lotId?: string | null;
  serialId?: string | null;
  fromLocationId?: string;
  actorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const kit = await tx.kit.findFirst({
      where: { id: input.kitId, organizationId: input.organizationId },
      include: { lines: { include: { part: true } } },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
    if (
      [KitStatus.SEALED, KitStatus.RELEASED, KitStatus.CANCELLED].includes(
        kit.status as typeof KitStatus.SEALED
      )
    ) {
      throw new DomainError("INVALID_STATUS", `Cannot stage kit in status ${kit.status}`);
    }

    const line = kit.lines.find((l) => l.partId === input.partId);
    if (!line) throw new DomainError("PART_NOT_ON_KIT", "Part is not on this kit BOM");
    if (line.stagedQty + input.qty > line.requiredQty) {
      throw new DomainError("OVER_STAGE", "Staging qty would exceed required qty");
    }

    const part = line.part;
    if (
      (part.tracking === "LOT" || part.tracking === "LOT_AND_SERIAL") &&
      !input.lotId
    ) {
      throw new DomainError("LOT_REQUIRED", "Lot required for this part");
    }
    if (
      (part.tracking === "SERIAL" || part.tracking === "LOT_AND_SERIAL") &&
      !input.serialId
    ) {
      throw new DomainError("SERIAL_REQUIRED", "Serial required for this part");
    }

    let fromLocationId = input.fromLocationId;
    if (!fromLocationId) {
      const source = await findBestSource(tx, {
        organizationId: input.organizationId,
        siteId: kit.siteId,
        partId: input.partId,
        qty: input.qty,
      });
      if (!source) throw new DomainError("INSUFFICIENT_STOCK", "No source stock found");
      fromLocationId = source.locationId;
      if (!input.lotId && source.lotId) input.lotId = source.lotId;
      if (!input.serialId && source.serialId) input.serialId = source.serialId;
    }

    // Bind staging cell
    if (!kit.stagingLocationId) {
      await tx.kit.update({
        where: { id: kit.id },
        data: { stagingLocationId: input.stagingLocationId },
      });
    } else if (kit.stagingLocationId !== input.stagingLocationId) {
      throw new DomainError(
        "STAGING_CELL_LOCKED",
        "Kit already bound to a different staging cell"
      );
    }

    await stageStock(tx, {
      organizationId: input.organizationId,
      siteId: kit.siteId,
      fromLocationId,
      toLocationId: input.stagingLocationId,
      partId: input.partId,
      qty: input.qty,
      lotId: input.lotId,
      serialId: input.serialId,
      kitId: kit.id,
      kitLineId: line.id,
      actorId: input.actorId,
    });

    const newStaged = line.stagedQty + input.qty;
    const lineStatus =
      newStaged >= line.requiredQty ? KitLineStatus.COMPLETE : KitLineStatus.PARTIAL;

    await tx.kitLine.update({
      where: { id: line.id },
      data: { stagedQty: newStaged, status: lineStatus },
    });

    const lines = await tx.kitLine.findMany({ where: { kitId: kit.id } });
    const allComplete = lines.every(
      (l) => l.id === line.id
        ? lineStatus === KitLineStatus.COMPLETE
        : l.status === KitLineStatus.COMPLETE
    );
    const anyStaged = lines.some((l) => (l.id === line.id ? newStaged : l.stagedQty) > 0);

    let status: KitStatus = kit.status;
    if (allComplete) status = KitStatus.STAGED;
    else if (anyStaged) status = KitStatus.PICKING;
    else if (kit.status === KitStatus.PENDING || kit.status === KitStatus.ALLOCATED) {
      status = KitStatus.PICKING;
    }

    const updated = await tx.kit.update({
      where: { id: kit.id },
      data: { status },
      include: {
        lines: { include: { part: true } },
        kitDefinition: true,
        demand: true,
        stagingLocation: true,
        dnaVersion: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "PART_STAGED",
        entityType: "Kit",
        entityId: kit.id,
        payloadJson: JSON.stringify({
          partId: input.partId,
          qty: input.qty,
          lotId: input.lotId,
          serialId: input.serialId,
        }),
      },
    });

    return updated;
  });
}

export async function validateAndSealKit(input: {
  organizationId: string;
  kitId: string;
  actorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const kit = await tx.kit.findFirst({
      where: { id: input.kitId, organizationId: input.organizationId },
      include: {
        lines: { include: { part: true, stagedSerials: true } },
        demand: true,
        dnaVersion: true,
        stagingLocation: true,
        transactions: {
          where: { type: "STAGE" },
          include: { lot: true, serial: true },
        },
      },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
    if (kit.status === KitStatus.SEALED || kit.status === KitStatus.RELEASED) {
      throw new DomainError("ALREADY_SEALED", "Kit already sealed");
    }
    if (!kit.stagingLocationId) {
      throw new DomainError("NO_STAGING_CELL", "Kit has no staging cell");
    }

    await tx.kit.update({
      where: { id: kit.id },
      data: { status: KitStatus.VALIDATING },
    });

    for (const line of kit.lines) {
      if (line.stagedQty < line.requiredQty) {
        throw new DomainError(
          "INCOMPLETE",
          `Line ${line.part.sku}: staged ${line.stagedQty}/${line.requiredQty}`
        );
      }
    }

    const sealedAt = new Date();
    const sealLines: SealLine[] = [];

    // Build seal lines from STAGE transactions for identity detail
    for (const line of kit.lines) {
      const stages = kit.transactions.filter((t) => t.kitLineId === line.id);
      if (stages.length === 0) {
        sealLines.push({
          partId: line.partId,
          sku: line.part.sku,
          qty: line.stagedQty,
          stagingCellId: kit.stagingLocationId,
        });
      } else {
        for (const t of stages) {
          sealLines.push({
            partId: line.partId,
            sku: line.part.sku,
            qty: t.qty,
            lotNumber: t.lot?.lotNumber,
            serialNumber: t.serial?.serialNumber,
            stagingCellId: kit.stagingLocationId,
          });
        }
      }
    }

    const demandType = kit.demand?.type ?? "ASSEMBLY_JOB";
    const fingerprint = computeKitSealFingerprint({
      organizationId: kit.organizationId,
      kitId: kit.id,
      dnaVersionId: kit.dnaVersionId,
      demandType,
      sealedAtIso: sealedAt.toISOString(),
      lines: sealLines,
    });

    await sealStagedStock(tx, {
      organizationId: kit.organizationId,
      siteId: kit.siteId,
      stagingLocationId: kit.stagingLocationId,
      kitId: kit.id,
      actorId: input.actorId,
      lines: kit.lines.map((l) => {
        const stage = kit.transactions.find((t) => t.kitLineId === l.id);
        return {
          partId: l.partId,
          qty: l.stagedQty,
          lotId: stage?.lotId,
          serialId: stage?.serialId,
          kitLineId: l.id,
        };
      }),
    });

    const sealed = await tx.kit.update({
      where: { id: kit.id },
      data: {
        status: KitStatus.SEALED,
        sealFingerprint: fingerprint,
        sealedAt,
        sealedById: input.actorId,
      },
      include: {
        lines: { include: { part: true } },
        kitDefinition: true,
        demand: true,
        stagingLocation: true,
        dnaVersion: true,
        sealedBy: true,
      },
    });

    const kitSheet = renderKitSheet(sealed, shortSealCode(fingerprint));
    await tx.document.create({
      data: {
        organizationId: kit.organizationId,
        kitId: kit.id,
        type: DocumentType.KIT_SHEET,
        content: kitSheet,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: kit.organizationId,
        actorId: input.actorId,
        action: "KIT_SEALED",
        entityType: "Kit",
        entityId: kit.id,
        payloadJson: JSON.stringify({
          sealFingerprint: fingerprint,
          shortSeal: shortSealCode(fingerprint),
        }),
      },
    });

    return sealed;
  });
}

export async function releaseKit(input: {
  organizationId: string;
  kitId: string;
  actorId?: string;
}) {
  const kit = await prisma.kit.findFirst({
    where: { id: input.kitId, organizationId: input.organizationId },
    include: { demand: true },
  });
  if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
  if (kit.status !== KitStatus.SEALED) {
    throw new DomainError("NOT_SEALED", "Only sealed kits can be released");
  }

  const released = await prisma.kit.update({
    where: { id: kit.id },
    data: { status: KitStatus.RELEASED },
    include: {
      lines: { include: { part: true } },
      kitDefinition: true,
      demand: true,
    },
  });

  await prisma.inventoryTransaction.create({
    data: {
      organizationId: kit.organizationId,
      siteId: kit.siteId,
      type: "RELEASE",
      partId: released.lines[0]?.partId ?? kit.kitDefinitionId,
      qty: 1,
      kitId: kit.id,
      actorId: input.actorId,
      metaJson: JSON.stringify({
        demandType: kit.demand?.type,
        target:
          kit.demand?.type === "FULFILLMENT_ORDER" ? "SHIP" : "ASSEMBLY",
      }),
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: kit.organizationId,
      actorId: input.actorId,
      action: "KIT_RELEASED",
      entityType: "Kit",
      entityId: kit.id,
      payloadJson: JSON.stringify({ demandType: kit.demand?.type }),
    },
  });

  return released;
}

export function renderPickList(kit: {
  kitInstanceCode: string;
  kitDefinition: { code: string; name: string };
  demand: { type: string; externalRef: string } | null;
  lines: Array<{
    requiredQty: number;
    stagedQty: number;
    part: { sku: string; name: string; tracking: string };
  }>;
  dnaVersion: { version: string; contentHash: string };
}): string {
  const lines = kit.lines
    .map(
      (l, i) =>
        `${i + 1}. [${l.part.sku}] ${l.part.name}  qty ${l.requiredQty}  tracking=${l.part.tracking}  staged ${l.stagedQty}`
    )
    .join("\n");
  return [
    "=== KITTINGMASTER PICK LIST ===",
    `Kit: ${kit.kitInstanceCode}`,
    `Definition: ${kit.kitDefinition.code} — ${kit.kitDefinition.name}`,
    `Demand: ${kit.demand?.type ?? "N/A"} / ${kit.demand?.externalRef ?? "—"}`,
    `Method DNA: v${kit.dnaVersion.version} (${kit.dnaVersion.contentHash.slice(0, 8)})`,
    "---",
    lines,
    "---",
    "Scan grammar: LOCATION → PART → [LOT] → [SERIAL]",
    "Dual-ledger: RAW reserve → STAGE → SEAL (KIT)",
  ].join("\n");
}

export function renderKitSheet(
  kit: {
    kitInstanceCode: string;
    sealFingerprint: string | null;
    sealedAt: Date | null;
    kitDefinition: { code: string; name: string };
    demand: { type: string; externalRef: string } | null;
    stagingLocation: { code: string; barcode: string } | null;
    lines: Array<{
      requiredQty: number;
      stagedQty: number;
      part: { sku: string; name: string };
    }>;
    dnaVersion: { version: string; contentHash: string };
  },
  shortSeal: string
): string {
  const lines = kit.lines
    .map(
      (l, i) =>
        `${i + 1}. ${l.part.sku}  ${l.part.name}  qty ${l.stagedQty}/${l.requiredQty}`
    )
    .join("\n");
  return [
    "=== KITTINGMASTER KIT SHEET ===",
    `Kit Instance: ${kit.kitInstanceCode}`,
    `Definition: ${kit.kitDefinition.code} — ${kit.kitDefinition.name}`,
    `Demand: ${kit.demand?.type ?? "N/A"} / ${kit.demand?.externalRef ?? "—"}`,
    `Staging Cell: ${kit.stagingLocation?.code ?? "—"} (${kit.stagingLocation?.barcode ?? ""})`,
    `Sealed At: ${kit.sealedAt?.toISOString() ?? "—"}`,
    `Kit Seal: ${shortSeal}`,
    `Fingerprint: ${kit.sealFingerprint ?? "—"}`,
    `Method DNA: v${kit.dnaVersion.version}`,
    "--- COMPONENTS ---",
    lines,
    "---",
    "This seal binds BOM, lot/serial identity, staging cell, and customer Method DNA version.",
  ].join("\n");
}

export { DomainError };
