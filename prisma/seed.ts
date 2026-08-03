import {
  DemandType,
  LocationType,
  PrismaClient,
  TrackingMode,
  ZoneType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PLATFORM_DEFAULT_CONFIG,
  PLATFORM_DEFAULT_STRATEGIES,
  hashDnaContent,
} from "../src/lib/dna/defaults";
import { applyReceipt } from "../src/lib/inventory/ledger";
import { createKitDemand, stagePartOnKit, validateAndSealKit } from "../src/lib/kits/service";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding KittingMaster demo…");

  await prisma.idempotencyKey.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.document.deleteMany();
  await prisma.scanSession.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryBalance.deleteMany();
  await prisma.serial.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.kitLine.deleteMany();
  await prisma.kit.deleteMany();
  await prisma.demand.deleteMany();
  await prisma.kitDefinitionLine.deleteMany();
  await prisma.kitDefinition.deleteMany();
  await prisma.part.deleteMany();
  await prisma.location.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.site.deleteMany();
  await prisma.methodDnaVersion.deleteMany();
  await prisma.methodDna.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = await bcrypt.hash("demo1234", 10);

  const org = await prisma.organization.create({
    data: {
      name: "Apex Assembly Co.",
      slug: "apex-assembly",
    },
  });

  const user = await prisma.user.create({
    data: {
      email: "demo@kittingmaster.app",
      name: "Demo Operator",
      passwordHash,
      memberships: {
        create: { organizationId: org.id, role: "OWNER" },
      },
    },
  });

  const site = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: "PLT1",
      name: "Plant 1 — Main",
    },
  });

  const site2 = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: "DC1",
      name: "Fulfillment DC",
    },
  });

  const storage = await prisma.zone.create({
    data: {
      siteId: site.id,
      code: "STG",
      name: "Storage",
      type: ZoneType.STORAGE,
    },
  });
  const stagingZone = await prisma.zone.create({
    data: {
      siteId: site.id,
      code: "KST",
      name: "Kit Staging",
      type: ZoneType.STAGING,
    },
  });

  const bins = await Promise.all(
    ["A-01-01", "A-01-02", "A-02-01", "B-01-01"].map((code) =>
      prisma.location.create({
        data: {
          zoneId: storage.id,
          code,
          barcode: `LOC-${code}`,
          type: LocationType.BIN,
          aisle: code.split("-")[0],
          bay: code.split("-")[1],
          level: code.split("-")[2],
        },
      })
    )
  );

  const cells = await Promise.all(
    ["CELL-01", "CELL-02", "CELL-03"].map((code) =>
      prisma.location.create({
        data: {
          zoneId: stagingZone.id,
          code,
          barcode: `STG-${code}`,
          type: LocationType.STAGING_CELL,
        },
      })
    )
  );

  const parts = {
    bracket: await prisma.part.create({
      data: {
        organizationId: org.id,
        sku: "BRK-100",
        name: "Mounting Bracket",
        tracking: TrackingMode.NONE,
        barcode: "BRK-100",
      },
    }),
    fastener: await prisma.part.create({
      data: {
        organizationId: org.id,
        sku: "FST-M6",
        name: "M6 Fastener Pack",
        tracking: TrackingMode.LOT,
        barcode: "FST-M6",
      },
    }),
    controller: await prisma.part.create({
      data: {
        organizationId: org.id,
        sku: "CTL-900",
        name: "Controller Module",
        tracking: TrackingMode.SERIAL,
        barcode: "CTL-900",
      },
    }),
    harness: await prisma.part.create({
      data: {
        organizationId: org.id,
        sku: "HRN-12",
        name: "Wire Harness 12-pin",
        tracking: TrackingMode.LOT_AND_SERIAL,
        barcode: "HRN-12",
      },
    }),
    label: await prisma.part.create({
      data: {
        organizationId: org.id,
        sku: "LBL-KIT",
        name: "Kit Label Sheet",
        tracking: TrackingMode.NONE,
        barcode: "LBL-KIT",
      },
    }),
  };

  const lotFst = await prisma.lot.create({
    data: {
      organizationId: org.id,
      partId: parts.fastener.id,
      lotNumber: "LOT-FST-2401",
      expiresAt: new Date("2027-01-01"),
    },
  });
  const lotFst2 = await prisma.lot.create({
    data: {
      organizationId: org.id,
      partId: parts.fastener.id,
      lotNumber: "LOT-FST-2402",
      expiresAt: new Date("2026-06-01"),
    },
  });
  const lotHrn = await prisma.lot.create({
    data: {
      organizationId: org.id,
      partId: parts.harness.id,
      lotNumber: "LOT-HRN-88",
      expiresAt: new Date("2028-01-01"),
    },
  });

  const serialsCtl = await Promise.all(
    ["SN-CTL-001", "SN-CTL-002", "SN-CTL-003", "SN-CTL-004"].map((sn) =>
      prisma.serial.create({
        data: {
          organizationId: org.id,
          partId: parts.controller.id,
          serialNumber: sn,
        },
      })
    )
  );

  const serialsHrn = await Promise.all(
    ["SN-HRN-101", "SN-HRN-102", "SN-HRN-103"].map((sn) =>
      prisma.serial.create({
        data: {
          organizationId: org.id,
          partId: parts.harness.id,
          serialNumber: sn,
          lotId: lotHrn.id,
        },
      })
    )
  );

  // Receipts
  await applyReceipt(prisma, {
    organizationId: org.id,
    siteId: site.id,
    locationId: bins[0].id,
    partId: parts.bracket.id,
    qty: 100,
  });
  await applyReceipt(prisma, {
    organizationId: org.id,
    siteId: site.id,
    locationId: bins[1].id,
    partId: parts.fastener.id,
    qty: 200,
    lotId: lotFst.id,
  });
  await applyReceipt(prisma, {
    organizationId: org.id,
    siteId: site.id,
    locationId: bins[1].id,
    partId: parts.fastener.id,
    qty: 50,
    lotId: lotFst2.id,
  });
  for (const s of serialsCtl) {
    await applyReceipt(prisma, {
      organizationId: org.id,
      siteId: site.id,
      locationId: bins[2].id,
      partId: parts.controller.id,
      qty: 1,
      serialId: s.id,
    });
  }
  for (const s of serialsHrn) {
    await applyReceipt(prisma, {
      organizationId: org.id,
      siteId: site.id,
      locationId: bins[3].id,
      partId: parts.harness.id,
      qty: 1,
      lotId: lotHrn.id,
      serialId: s.id,
    });
  }
  await applyReceipt(prisma, {
    organizationId: org.id,
    siteId: site.id,
    locationId: bins[0].id,
    partId: parts.label.id,
    qty: 500,
  });

  // Method DNA
  const strategies = { ...PLATFORM_DEFAULT_STRATEGIES };
  const config = { ...PLATFORM_DEFAULT_CONFIG };
  const contentHash = hashDnaContent(strategies, config);

  const dna = await prisma.methodDna.create({
    data: {
      organizationId: org.id,
      name: "Apex Production DNA",
      isDefault: true,
      versions: {
        create: {
          version: "1.0.0",
          isPublished: true,
          publishedAt: new Date(),
          configJson: JSON.stringify(config),
          strategiesJson: JSON.stringify(strategies),
          contentHash,
        },
      },
    },
    include: { versions: true },
  });

  // Kit definitions
  const assemblyBom = await prisma.kitDefinition.create({
    data: {
      organizationId: org.id,
      code: "ASM-DRIVE",
      name: "Drive Assembly Kit",
      revision: "A",
      lines: {
        create: [
          { partId: parts.bracket.id, qty: 2, sortOrder: 1 },
          { partId: parts.fastener.id, qty: 8, sortOrder: 2 },
          { partId: parts.controller.id, qty: 1, sortOrder: 3 },
          { partId: parts.harness.id, qty: 1, sortOrder: 4 },
        ],
      },
    },
  });

  const fulfillBom = await prisma.kitDefinition.create({
    data: {
      organizationId: org.id,
      code: "SHIP-STARTER",
      name: "Customer Starter Kit",
      revision: "A",
      lines: {
        create: [
          { partId: parts.bracket.id, qty: 1, sortOrder: 1 },
          { partId: parts.fastener.id, qty: 4, sortOrder: 2 },
          { partId: parts.label.id, qty: 1, sortOrder: 3 },
        ],
      },
    },
  });

  // Sample kits in various states
  const kitAllocated = await createKitDemand({
    organizationId: org.id,
    siteId: site.id,
    kitDefinitionId: assemblyBom.id,
    demandType: DemandType.ASSEMBLY_JOB,
    externalRef: "WO-1001",
    actorId: user.id,
  });

  const kitFulfill = await createKitDemand({
    organizationId: org.id,
    siteId: site.id,
    kitDefinitionId: fulfillBom.id,
    demandType: DemandType.FULFILLMENT_ORDER,
    externalRef: "SO-5502",
    actorId: user.id,
  });

  // Partially stage one kit
  const kitPicking = await createKitDemand({
    organizationId: org.id,
    siteId: site.id,
    kitDefinitionId: fulfillBom.id,
    demandType: DemandType.FULFILLMENT_ORDER,
    externalRef: "SO-5503",
    actorId: user.id,
  });

  await stagePartOnKit({
    organizationId: org.id,
    kitId: kitPicking.id,
    stagingLocationId: cells[0].id,
    partId: parts.bracket.id,
    qty: 1,
    actorId: user.id,
  });

  // Fully stage + seal one
  const kitToSeal = await createKitDemand({
    organizationId: org.id,
    siteId: site.id,
    kitDefinitionId: fulfillBom.id,
    demandType: DemandType.FULFILLMENT_ORDER,
    externalRef: "SO-5504",
    actorId: user.id,
  });

  await stagePartOnKit({
    organizationId: org.id,
    kitId: kitToSeal.id,
    stagingLocationId: cells[1].id,
    partId: parts.bracket.id,
    qty: 1,
    actorId: user.id,
  });
  await stagePartOnKit({
    organizationId: org.id,
    kitId: kitToSeal.id,
    stagingLocationId: cells[1].id,
    partId: parts.fastener.id,
    qty: 4,
    lotId: lotFst2.id, // FEFO older lot preferred in allocate; use available
    actorId: user.id,
  });
  await stagePartOnKit({
    organizationId: org.id,
    kitId: kitToSeal.id,
    stagingLocationId: cells[1].id,
    partId: parts.label.id,
    qty: 1,
    actorId: user.id,
  });
  const sealed = await validateAndSealKit({
    organizationId: org.id,
    kitId: kitToSeal.id,
    actorId: user.id,
  });

  console.log("Seed complete.");
  console.log({
    login: "demo@kittingmaster.app / demo1234",
    org: org.slug,
    sites: [site.code, site2.code],
    dna: dna.versions[0]?.version,
    kits: {
      allocated: kitAllocated.kitInstanceCode,
      fulfill: kitFulfill.kitInstanceCode,
      picking: kitPicking.kitInstanceCode,
      sealed: sealed.kitInstanceCode,
      seal: sealed.sealFingerprint?.slice(0, 12),
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
