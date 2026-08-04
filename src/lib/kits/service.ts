import { DemandType, DocumentType, KitLineStatus, KitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DomainError,
  findBestSource,
  findHoldSource,
  reserveStock,
  sealStagedStock,
  stageStock,
  unreserveKitHolds,
} from "@/lib/inventory/ledger";
import { computeKitSealFingerprint, shortSealCode, type SealLine } from "@/lib/seal/fingerprint";
import { PLATFORM_DEFAULT_CONFIG } from "@/lib/dna/defaults";

function kitCode(prefix: string) {
  const n = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `${prefix}-${n}`;
}

export function parseDnaConfig(configJson: string | null | undefined) {
  try {
    return { ...PLATFORM_DEFAULT_CONFIG, ...(configJson ? JSON.parse(configJson) : {}) } as {
      allowPartialAllocate?: boolean;
      requireStagingCellBeforeParts?: boolean;
      sealIncludesDnaVersion?: boolean;
      fefo?: boolean;
      serialQtyAlwaysOne?: boolean;
      documentTitle?: string;
      brandTagline?: string;
    };
  } catch {
    return { ...PLATFORM_DEFAULT_CONFIG };
  }
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
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, organizationId: input.organizationId },
  });
  if (!site) throw new DomainError("NOT_FOUND", "Site not found for organization");

  const def = await prisma.kitDefinition.findFirst({
    where: { id: input.kitDefinitionId, organizationId: input.organizationId },
    include: { lines: { include: { part: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!def) throw new DomainError("NOT_FOUND", "Kit definition not found");
  if (def.lines.length === 0) throw new DomainError("EMPTY_BOM", "Kit definition has no lines");

  const dnaVersion = await getPublishedDnaVersion(input.organizationId);
  const dnaConfig = parseDnaConfig(dnaVersion.configJson);
  const preferFefo = dnaConfig.fefo !== false;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
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

        let allAllocated = true;
        for (const line of kit.lines) {
          const tracking = line.part.tracking;
          const needsSerial = tracking === "SERIAL" || tracking === "LOT_AND_SERIAL";
          // Serial lines: reserve one unit at a time per available serial
          if (needsSerial) {
            let remaining = line.requiredQty;
            while (remaining > 0) {
              const source = await findBestSource(tx, {
                organizationId: input.organizationId,
                siteId: input.siteId,
                partId: line.partId,
                qty: 1,
                preferFefo,
              });
              if (!source || source.partial || !source.serialId) {
                allAllocated = false;
                break;
              }
              await reserveStock(tx, {
                organizationId: input.organizationId,
                siteId: input.siteId,
                locationId: source.locationId,
                partId: line.partId,
                qty: 1,
                lotId: source.lotId || null,
                serialId: source.serialId,
                kitId: kit.id,
                kitLineId: line.id,
                actorId: input.actorId,
              });
              remaining -= 1;
            }
            continue;
          }

          const source = await findBestSource(tx, {
            organizationId: input.organizationId,
            siteId: input.siteId,
            partId: line.partId,
            qty: line.requiredQty,
            preferFefo,
          });
          if (!source || source.partial) {
            allAllocated = false;
            if (!dnaConfig.allowPartialAllocate) {
              throw new DomainError("INSUFFICIENT_STOCK", `Cannot fully allocate ${line.part.sku}`);
            }
            continue;
          }
          await reserveStock(tx, {
            organizationId: input.organizationId,
            siteId: input.siteId,
            locationId: source.locationId,
            partId: line.partId,
            qty: line.requiredQty,
            lotId: source.lotId || null,
            serialId: null,
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
    } catch (e) {
      // Retry kit code collision
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("Unique constraint") || (e as { code?: string }).code === "P2002") {
        continue;
      }
      throw e;
    }
  }
  throw new DomainError("KIT_CODE_COLLISION", "Could not allocate unique kit code");
}

const STAGE_BLOCKED: KitStatus[] = [
  KitStatus.SEALED,
  KitStatus.RELEASED,
  KitStatus.CANCELLED,
  KitStatus.EXCEPTION,
];

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
    // Row lock for concurrent stage on same kit
    await tx.$queryRaw`
      SELECT id FROM "Kit" WHERE id = ${input.kitId} AND "organizationId" = ${input.organizationId} FOR UPDATE
    `;

    const kit = await tx.kit.findFirst({
      where: { id: input.kitId, organizationId: input.organizationId },
      include: {
        lines: { include: { part: true } },
        dnaVersion: true,
      },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
    if (STAGE_BLOCKED.includes(kit.status)) {
      throw new DomainError("INVALID_STATUS", `Cannot stage kit in status ${kit.status}`);
    }

    const dnaConfig = parseDnaConfig(kit.dnaVersion?.configJson);
    const line = kit.lines.find((l) => l.partId === input.partId);
    if (!line) throw new DomainError("PART_NOT_ON_KIT", "Part is not on this kit BOM");
    if (line.stagedQty + input.qty > line.requiredQty + 1e-9) {
      throw new DomainError("OVER_STAGE", "Staging qty would exceed required qty");
    }

    const part = line.part;
    if ((part.tracking === "LOT" || part.tracking === "LOT_AND_SERIAL") && !input.lotId) {
      throw new DomainError("LOT_REQUIRED", "Lot required for this part");
    }
    if ((part.tracking === "SERIAL" || part.tracking === "LOT_AND_SERIAL") && !input.serialId) {
      throw new DomainError("SERIAL_REQUIRED", "Serial required for this part");
    }
    if (
      input.serialId &&
      (dnaConfig.serialQtyAlwaysOne !== false ||
        part.tracking === "SERIAL" ||
        part.tracking === "LOT_AND_SERIAL") &&
      input.qty !== 1
    ) {
      throw new DomainError("SERIAL_QTY", "Serial-controlled stage must be qty 1");
    }

    let fromLocationId = input.fromLocationId;
    // Prefer kit hold location matching identity
    if (!fromLocationId) {
      const hold = await findHoldSource(tx, {
        kitId: kit.id,
        kitLineId: line.id,
        partId: input.partId,
        lotId: input.lotId,
        serialId: input.serialId,
      });
      if (hold) {
        fromLocationId = hold.locationId;
      }
    }
    if (!fromLocationId) {
      const source = await findBestSource(tx, {
        organizationId: input.organizationId,
        siteId: kit.siteId,
        partId: input.partId,
        qty: input.qty,
        preferFefo: dnaConfig.fefo !== false,
        lotId: input.lotId,
        serialId: input.serialId,
      });
      if (!source) throw new DomainError("INSUFFICIENT_STOCK", "No source stock found");
      fromLocationId = source.locationId;
      if (!input.lotId && source.lotId) input.lotId = source.lotId;
      if (!input.serialId && source.serialId) input.serialId = source.serialId;
    } else if (input.lotId || input.serialId) {
      // Ensure identity stock exists at chosen location
      const source = await findBestSource(tx, {
        organizationId: input.organizationId,
        siteId: kit.siteId,
        partId: input.partId,
        qty: input.qty,
        preferFefo: dnaConfig.fefo !== false,
        lotId: input.lotId,
        serialId: input.serialId,
        preferLocationId: fromLocationId,
      });
      if (!source) {
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          "Scanned lot/serial not available at source location"
        );
      }
      fromLocationId = source.locationId;
    }

    if (!kit.stagingLocationId) {
      await tx.kit.update({
        where: { id: kit.id },
        data: { stagingLocationId: input.stagingLocationId },
      });
    } else if (kit.stagingLocationId !== input.stagingLocationId) {
      throw new DomainError("STAGING_CELL_LOCKED", "Kit already bound to a different staging cell");
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
      newStaged >= line.requiredQty - 1e-9 ? KitLineStatus.COMPLETE : KitLineStatus.PARTIAL;

    await tx.kitLine.update({
      where: { id: line.id },
      data: { stagedQty: newStaged, status: lineStatus },
    });

    const lines = await tx.kitLine.findMany({ where: { kitId: kit.id } });
    const allComplete = lines.every((l) =>
      l.id === line.id ? lineStatus === KitLineStatus.COMPLETE : l.status === KitLineStatus.COMPLETE
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
  return prisma
    .$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "Kit"
        WHERE id = ${input.kitId} AND "organizationId" = ${input.organizationId}
        FOR UPDATE
      `;

      const kit = await tx.kit.findFirst({
        where: { id: input.kitId, organizationId: input.organizationId },
        include: {
          lines: { include: { part: true, stagedSerials: true } },
          demand: true,
          dnaVersion: true,
          stagingLocation: true,
          kitDefinition: { include: { lines: true } },
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
      if (kit.status === KitStatus.EXCEPTION) {
        throw new DomainError("INVALID_STATUS", "Cannot seal kit in EXCEPTION");
      }
      if (kit.status === KitStatus.CANCELLED) {
        throw new DomainError("INVALID_STATUS", "Cannot seal cancelled kit");
      }
      if (!kit.stagingLocationId) {
        throw new DomainError("NO_STAGING_CELL", "Kit has no staging cell");
      }

      // CAS: only leave sealable statuses
      const claimed = await tx.kit.updateMany({
        where: {
          id: kit.id,
          status: {
            in: [
              KitStatus.PENDING,
              KitStatus.ALLOCATED,
              KitStatus.PICKING,
              KitStatus.STAGED,
              KitStatus.VALIDATING,
            ],
          },
        },
        data: { status: KitStatus.VALIDATING },
      });
      if (claimed.count === 0) {
        throw new DomainError("ALREADY_SEALED", "Kit seal race lost or invalid status");
      }

      const optionalParts = new Set(
        (kit.kitDefinition?.lines || []).filter((l) => l.isOptional).map((l) => l.partId)
      );

      for (const line of kit.lines) {
        if (optionalParts.has(line.partId) && line.stagedQty === 0) continue;
        if (line.stagedQty + 1e-9 < line.requiredQty) {
          throw new DomainError(
            "INCOMPLETE",
            `Line ${line.part.sku}: staged ${line.stagedQty}/${line.requiredQty}`
          );
        }
        const tracking = line.part.tracking;
        const stages = kit.transactions.filter((t) => t.kitLineId === line.id);
        if (tracking === "LOT" || tracking === "LOT_AND_SERIAL") {
          if (stages.some((t) => !t.lotId)) {
            throw new DomainError(
              "LOT_REQUIRED",
              `Missing lot identity on staged ${line.part.sku}`
            );
          }
        }
        if (tracking === "SERIAL" || tracking === "LOT_AND_SERIAL") {
          if (stages.some((t) => !t.serialId)) {
            throw new DomainError(
              "SERIAL_REQUIRED",
              `Missing serial identity on staged ${line.part.sku}`
            );
          }
        }
      }

      const sealedAt = new Date();
      const sealLines: SealLine[] = [];
      const stockLines: Array<{
        partId: string;
        qty: number;
        lotId?: string | null;
        serialId?: string | null;
        kitLineId: string;
      }> = [];

      for (const line of kit.lines) {
        if (optionalParts.has(line.partId) && line.stagedQty === 0) continue;
        const stages = kit.transactions.filter((t) => t.kitLineId === line.id);
        if (stages.length === 0) {
          sealLines.push({
            partId: line.partId,
            sku: line.part.sku,
            qty: line.stagedQty,
            stagingCellId: kit.stagingLocationId,
          });
          stockLines.push({
            partId: line.partId,
            qty: line.stagedQty,
            kitLineId: line.id,
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
            stockLines.push({
              partId: line.partId,
              qty: t.qty,
              lotId: t.lotId,
              serialId: t.serialId,
              kitLineId: line.id,
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
        lines: stockLines,
      });

      // KIT ledger materialization: one RELEASE-ready seal marker qty=1 for kit instance
      await tx.inventoryTransaction.create({
        data: {
          organizationId: kit.organizationId,
          siteId: kit.siteId,
          type: "SEAL",
          partId: kit.lines[0]?.partId ?? kit.kitDefinitionId,
          qty: 1,
          kitId: kit.id,
          actorId: input.actorId,
          metaJson: JSON.stringify({
            ledger: "KIT",
            kitInstanceCode: kit.kitInstanceCode,
            sealFingerprint: fingerprint,
          }),
        },
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
    })
    .then(async (sealed) => {
      try {
        const { dispatchWebhook } = await import("@/lib/ops/webhooks");
        const org = await prisma.organization.findUnique({
          where: { id: sealed.organizationId },
        });
        const result = await dispatchWebhook(
          org?.webhookUrl,
          {
            event: "kit.sealed",
            organizationId: sealed.organizationId,
            occurredAt: new Date().toISOString(),
            data: {
              kitId: sealed.id,
              kitInstanceCode: sealed.kitInstanceCode,
              sealFingerprint: sealed.sealFingerprint,
              demandType: sealed.demand?.type,
              externalRef: sealed.demand?.externalRef,
            },
          },
          org?.webhookSecret
        );
        if (!result.ok) {
          await prisma.auditEvent.create({
            data: {
              organizationId: sealed.organizationId,
              action: "WEBHOOK_FAILED",
              entityType: "Kit",
              entityId: sealed.id,
              payloadJson: JSON.stringify({ event: "kit.sealed", error: result.error }),
            },
          });
        }
      } catch {
        /* never block seal on webhook */
      }
      return sealed;
    });
}

export async function releaseKit(input: {
  organizationId: string;
  kitId: string;
  actorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.kit.updateMany({
      where: {
        id: input.kitId,
        organizationId: input.organizationId,
        status: KitStatus.SEALED,
      },
      data: { status: KitStatus.RELEASED },
    });
    if (claimed.count === 0) {
      const kit = await tx.kit.findFirst({
        where: { id: input.kitId, organizationId: input.organizationId },
      });
      if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
      throw new DomainError("NOT_SEALED", "Only sealed kits can be released");
    }

    const released = await tx.kit.findFirstOrThrow({
      where: { id: input.kitId },
      include: {
        lines: { include: { part: true } },
        kitDefinition: true,
        demand: true,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        organizationId: released.organizationId,
        siteId: released.siteId,
        type: "RELEASE",
        partId: released.kitDefinitionId,
        qty: 1,
        kitId: released.id,
        actorId: input.actorId,
        metaJson: JSON.stringify({
          ledger: "KIT",
          kitInstanceCode: released.kitInstanceCode,
          demandType: released.demand?.type,
          target: released.demand?.type === "FULFILLMENT_ORDER" ? "SHIP" : "ASSEMBLY",
        }),
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: released.organizationId,
        actorId: input.actorId,
        action: "KIT_RELEASED",
        entityType: "Kit",
        entityId: released.id,
        payloadJson: JSON.stringify({ demandType: released.demand?.type }),
      },
    });

    return released;
  });
}

export async function cancelKit(input: {
  organizationId: string;
  kitId: string;
  actorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const kit = await tx.kit.findFirst({
      where: { id: input.kitId, organizationId: input.organizationId },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
    if (
      kit.status === KitStatus.SEALED ||
      kit.status === KitStatus.RELEASED ||
      kit.status === KitStatus.CANCELLED
    ) {
      throw new DomainError("INVALID_STATUS", `Cannot cancel kit in ${kit.status}`);
    }
    await unreserveKitHolds(tx, {
      organizationId: input.organizationId,
      kitId: kit.id,
      actorId: input.actorId,
    });
    return tx.kit.update({
      where: { id: kit.id },
      data: { status: KitStatus.CANCELLED },
    });
  });
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
    .map((l, i) => `${i + 1}. ${l.part.sku}  ${l.part.name}  qty ${l.stagedQty}/${l.requiredQty}`)
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
