import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stagePartOnKit, DomainError } from "@/lib/kits/service";
import { promptForState, transitionScan, type ScanState } from "@/lib/scan/grammar";
import { jsonError, jsonOk } from "@/lib/api";

const schema = z.object({
  clientEventId: z.string().min(1),
  kitId: z.string().min(1),
  barcode: z.string().min(1),
  qty: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        organizationId_clientEventId: {
          organizationId: session.organizationId,
          clientEventId: body.clientEventId,
        },
      },
    });
    if (existing) {
      return jsonOk(JSON.parse(existing.responseJson));
    }

    const kit = await prisma.kit.findFirst({
      where: { id: body.kitId, organizationId: session.organizationId },
      include: { lines: { include: { part: true } }, stagingLocation: true },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");

    let sessionRow = await prisma.scanSession.findFirst({
      where: { kitId: kit.id, operatorId: session.userId },
      orderBy: { lastEventAt: "desc" },
    });
    if (!sessionRow) {
      sessionRow = await prisma.scanSession.create({
        data: {
          kitId: kit.id,
          operatorId: session.userId,
          state: kit.stagingLocationId ? "EXPECT_PART" : "EXPECT_LOCATION",
        },
      });
    }

    const barcode = body.barcode.trim();
    let state = sessionRow.state as ScanState;
    let message = "";
    let stagedKit = null as Awaited<ReturnType<typeof stagePartOnKit>> | null;

    // Resolve barcode entity
    const location = await prisma.location.findFirst({
      where: { barcode, zone: { siteId: kit.siteId } },
    });
    const part = await prisma.part.findFirst({
      where: {
        organizationId: session.organizationId,
        OR: [{ barcode }, { sku: barcode }],
      },
    });
    const lot = await prisma.lot.findFirst({
      where: {
        organizationId: session.organizationId,
        lotNumber: barcode,
        ...(sessionRow.pendingPartId ? { partId: sessionRow.pendingPartId } : {}),
      },
    });
    const serial = await prisma.serial.findFirst({
      where: {
        organizationId: session.organizationId,
        serialNumber: barcode,
        ...(sessionRow.pendingPartId ? { partId: sessionRow.pendingPartId } : {}),
      },
    });

    if (location?.type === "STAGING_CELL" || (location && state === "EXPECT_LOCATION")) {
      const g = transitionScan({ state, event: "SCAN_LOCATION" });
      if (!g.ok) throw new DomainError(g.code, g.message);
      state = g.next;
      message = g.message;
      if (!kit.stagingLocationId || kit.stagingLocationId === location.id) {
        await prisma.kit.update({
          where: { id: kit.id },
          data: { stagingLocationId: location.id },
        });
      }
      await prisma.scanSession.update({
        where: { id: sessionRow.id },
        data: { state, lastEventAt: new Date(), pendingPartId: null, pendingLotId: null },
      });
    } else if (part && (state === "EXPECT_PART" || state === "COMPLETE" || state === "EXPECT_LOCATION")) {
      // If still expecting location but scanned part, fail unless already has cell
      if (state === "EXPECT_LOCATION" && !kit.stagingLocationId) {
        throw new DomainError("EXPECTED_LOCATION", "Scan staging cell first");
      }
      const g = transitionScan({
        state: state === "COMPLETE" ? "EXPECT_PART" : state === "EXPECT_LOCATION" ? "EXPECT_PART" : state,
        event: "SCAN_PART",
        tracking: part.tracking,
      });
      if (!g.ok) throw new DomainError(g.code, g.message);
      state = g.next;
      message = g.message;

      if (state === "COMPLETE") {
        const cellId = kit.stagingLocationId;
        if (!cellId) throw new DomainError("NO_STAGING_CELL", "No staging cell");
        stagedKit = await stagePartOnKit({
          organizationId: session.organizationId,
          kitId: kit.id,
          stagingLocationId: cellId,
          partId: part.id,
          qty: body.qty ?? 1,
          actorId: session.userId,
        });
        state = "EXPECT_PART";
        message = `Staged ${part.sku}. Scan next part or seal.`;
        await prisma.scanSession.update({
          where: { id: sessionRow.id },
          data: { state, lastEventAt: new Date(), pendingPartId: null, pendingLotId: null },
        });
      } else {
        await prisma.scanSession.update({
          where: { id: sessionRow.id },
          data: {
            state,
            lastEventAt: new Date(),
            pendingPartId: part.id,
            pendingLotId: null,
          },
        });
      }
    } else if (lot && state === "EXPECT_LOT") {
      const pendingPart = sessionRow.pendingPartId
        ? await prisma.part.findUnique({ where: { id: sessionRow.pendingPartId } })
        : null;
      if (!pendingPart) throw new DomainError("NO_PENDING_PART", "Scan part first");
      const g = transitionScan({
        state,
        event: "SCAN_LOT",
        tracking: pendingPart.tracking,
      });
      if (!g.ok) throw new DomainError(g.code, g.message);
      state = g.next;
      message = g.message;

      if (state === "COMPLETE") {
        const cellId = kit.stagingLocationId;
        if (!cellId) throw new DomainError("NO_STAGING_CELL", "No staging cell");
        stagedKit = await stagePartOnKit({
          organizationId: session.organizationId,
          kitId: kit.id,
          stagingLocationId: cellId,
          partId: pendingPart.id,
          qty: body.qty ?? 1,
          lotId: lot.id,
          actorId: session.userId,
        });
        state = "EXPECT_PART";
        message = `Staged ${pendingPart.sku} lot ${lot.lotNumber}. Scan next part.`;
        await prisma.scanSession.update({
          where: { id: sessionRow.id },
          data: { state, lastEventAt: new Date(), pendingPartId: null, pendingLotId: null },
        });
      } else {
        await prisma.scanSession.update({
          where: { id: sessionRow.id },
          data: {
            state,
            lastEventAt: new Date(),
            pendingLotId: lot.id,
          },
        });
      }
    } else if (serial && (state === "EXPECT_SERIAL" || state === "EXPECT_PART")) {
      let pendingPart = sessionRow.pendingPartId
        ? await prisma.part.findUnique({ where: { id: sessionRow.pendingPartId } })
        : null;
      if (!pendingPart && serial.partId) {
        pendingPart = await prisma.part.findUnique({ where: { id: serial.partId } });
      }
      if (!pendingPart) throw new DomainError("NO_PENDING_PART", "Unknown serial part");

      // If scanned serial while expecting part, accept as part+serial path
      if (state === "EXPECT_PART") {
        const g = transitionScan({
          state,
          event: "SCAN_PART",
          tracking: pendingPart.tracking,
        });
        state = g.ok ? g.next : state;
      }

      const g = transitionScan({
        state: state === "EXPECT_PART" ? "EXPECT_SERIAL" : state,
        event: "SCAN_SERIAL",
        tracking: pendingPart.tracking,
      });
      if (!g.ok) throw new DomainError(g.code, g.message);

      const cellId = kit.stagingLocationId;
      if (!cellId) throw new DomainError("NO_STAGING_CELL", "No staging cell");
      stagedKit = await stagePartOnKit({
        organizationId: session.organizationId,
        kitId: kit.id,
        stagingLocationId: cellId,
        partId: pendingPart.id,
        qty: 1,
        lotId: serial.lotId || sessionRow.pendingLotId,
        serialId: serial.id,
        actorId: session.userId,
      });
      state = "EXPECT_PART";
      message = `Staged serial ${serial.serialNumber}. Scan next part.`;
      await prisma.scanSession.update({
        where: { id: sessionRow.id },
        data: { state, lastEventAt: new Date(), pendingPartId: null, pendingLotId: null },
      });
    } else {
      throw new DomainError(
        "UNKNOWN_BARCODE",
        `Could not resolve barcode "${barcode}" for state ${state}`
      );
    }

    const fresh = stagedKit
      ? stagedKit
      : await prisma.kit.findFirst({
          where: { id: kit.id },
          include: {
            lines: { include: { part: true } },
            kitDefinition: true,
            demand: true,
            stagingLocation: true,
            dnaVersion: true,
          },
        });

    const response = {
      ok: true,
      message,
      prompt: promptForState(state),
      state,
      kit: fresh,
    };

    await prisma.idempotencyKey.create({
      data: {
        organizationId: session.organizationId,
        clientEventId: body.clientEventId,
        responseJson: JSON.stringify(response),
      },
    });

    return jsonOk(response);
  } catch (e) {
    return jsonError(e);
  }
}
