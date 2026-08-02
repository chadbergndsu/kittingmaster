import { DocumentType, WaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { renderPickList } from "@/lib/kits/service";

function waveCode() {
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `WV-${n}`;
}

/**
 * Wave picking — market standard for batching multiple kits into one pick run.
 * Groups ALLOCATED/PENDING kits, releases pick lists ordered by location affinity.
 */
export async function createWave(input: {
  organizationId: string;
  siteId: string;
  kitIds: string[];
  name?: string;
  notes?: string;
  actorId?: string;
}) {
  if (input.kitIds.length === 0) {
    throw new DomainError("EMPTY_WAVE", "Select at least one kit");
  }

  const kits = await prisma.kit.findMany({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      id: { in: input.kitIds },
    },
    include: {
      lines: { include: { part: true } },
      kitDefinition: true,
      demand: true,
      dnaVersion: true,
    },
  });

  if (kits.length !== input.kitIds.length) {
    throw new DomainError("INVALID_KITS", "One or more kits not found for site");
  }

  for (const k of kits) {
    if (["SEALED", "RELEASED", "CANCELLED"].includes(k.status)) {
      throw new DomainError(
        "INVALID_STATUS",
        `Kit ${k.kitInstanceCode} cannot join wave (${k.status})`
      );
    }
  }

  const wave = await prisma.wave.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      code: waveCode(),
      name: input.name || `Wave ${new Date().toISOString().slice(0, 16)}`,
      notes: input.notes,
      status: WaveStatus.OPEN,
      kits: {
        create: kits.map((k, i) => ({ kitId: k.id, sortOrder: i + 1 })),
      },
    },
    include: {
      kits: { include: { kit: { include: { kitDefinition: true, demand: true } } } },
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "WAVE_CREATED",
      entityType: "Wave",
      entityId: wave.id,
      payloadJson: JSON.stringify({ code: wave.code, kitCount: kits.length }),
    },
  });

  return wave;
}

export async function releaseWave(input: {
  organizationId: string;
  waveId: string;
  actorId?: string;
}) {
  const wave = await prisma.wave.findFirst({
    where: { id: input.waveId, organizationId: input.organizationId },
    include: {
      kits: {
        include: {
          kit: {
            include: {
              lines: { include: { part: true } },
              kitDefinition: true,
              demand: true,
              dnaVersion: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!wave) throw new DomainError("NOT_FOUND", "Wave not found");
  if (wave.status !== WaveStatus.OPEN && wave.status !== WaveStatus.RELEASED) {
    throw new DomainError("INVALID_STATUS", `Wave is ${wave.status}`);
  }

  // Build consolidated pick document (market: single wave pick list)
  const lines: string[] = [
    `=== KITTINGMASTER WAVE PICK LIST ===`,
    `Wave: ${wave.code} · ${wave.name ?? ""}`,
    `Kits: ${wave.kits.length}`,
    `Released: ${new Date().toISOString()}`,
    "---",
  ];

  // Aggregate demand by SKU for batch pick efficiency
  const agg = new Map<string, { sku: string; name: string; qty: number }>();
  for (const wk of wave.kits) {
    for (const line of wk.kit.lines) {
      const need = Math.max(0, line.requiredQty - line.stagedQty);
      if (need <= 0) continue;
      const cur = agg.get(line.partId) || {
        sku: line.part.sku,
        name: line.part.name,
        qty: 0,
      };
      cur.qty += need;
      agg.set(line.partId, cur);
    }
  }

  lines.push("BATCH AGGREGATE (pick once for all kits)");
  let i = 1;
  for (const row of [...agg.values()].sort((a, b) => a.sku.localeCompare(b.sku))) {
    lines.push(`${i++}. [${row.sku}] ${row.name}  qty ${row.qty}`);
  }
  lines.push("---");
  lines.push("KIT BREAKDOWN");
  for (const wk of wave.kits) {
    lines.push("");
    lines.push(renderPickList(wk.kit));
  }

  const content = lines.join("\n");

  await prisma.$transaction(async (tx) => {
    await tx.wave.update({
      where: { id: wave.id },
      data: { status: WaveStatus.RELEASED, releasedAt: new Date() },
    });
    for (const wk of wave.kits) {
      if (wk.kit.status === "PENDING" || wk.kit.status === "ALLOCATED") {
        await tx.kit.update({
          where: { id: wk.kitId },
          data: { status: "PICKING" },
        });
      }
      await tx.document.create({
        data: {
          organizationId: input.organizationId,
          kitId: wk.kitId,
          type: DocumentType.WAVE_LIST,
          content: `Wave ${wave.code}\n\n${content}`,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "WAVE_RELEASED",
        entityType: "Wave",
        entityId: wave.id,
        payloadJson: JSON.stringify({ code: wave.code }),
      },
    });
  });

  return prisma.wave.findUnique({
    where: { id: wave.id },
    include: {
      kits: {
        include: { kit: { include: { kitDefinition: true, demand: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}
