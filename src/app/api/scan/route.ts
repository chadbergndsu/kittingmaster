import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { stagePartOnKit, DomainError, parseDnaConfig } from "@/lib/kits/service";
import { promptForState, transitionScan, type ScanState } from "@/lib/scan/grammar";
import { jsonError, jsonOk } from "@/lib/api";

const schema = z.object({
  clientEventId: z.string().min(1),
  kitId: z.string().min(1),
  barcode: z.string().min(1),
  qty: z.number().positive().optional(),
  reset: z.boolean().optional(),
});

const OPEN_SCAN_STATUSES = new Set(["PENDING", "ALLOCATED", "PICKING", "STAGED", "VALIDATING"]);

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(OPERATOR_ROLES, "Operators+ required to scan");
    const body = schema.parse(await req.json());
    return await runScan(session, body);
  } catch (e) {
    return jsonError(e);
  }
}

type Session = Awaited<ReturnType<typeof requireRole>>;

/**
 * Idempotency: claim unique key first (pending), complete response on success,
 * delete claim on failure so retries work. Successful stage is not re-applied
 * because the key is retained with the full response.
 */
async function runScan(session: Session, body: z.infer<typeof schema>) {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      organizationId_clientEventId: {
        organizationId: session.organizationId,
        clientEventId: body.clientEventId,
      },
    },
  });
  if (existing) {
    const parsed = JSON.parse(existing.responseJson);
    if (parsed.pending) {
      throw new DomainError("IN_FLIGHT", "Scan event already processing");
    }
    return jsonOk(parsed);
  }

  try {
    await prisma.idempotencyKey.create({
      data: {
        organizationId: session.organizationId,
        clientEventId: body.clientEventId,
        responseJson: JSON.stringify({ pending: true }),
      },
    });
  } catch {
    const race = await prisma.idempotencyKey.findUnique({
      where: {
        organizationId_clientEventId: {
          organizationId: session.organizationId,
          clientEventId: body.clientEventId,
        },
      },
    });
    if (race) {
      const parsed = JSON.parse(race.responseJson);
      if (parsed.pending) throw new DomainError("IN_FLIGHT", "Scan event already processing");
      return jsonOk(parsed);
    }
    throw new DomainError("IDEMPOTENCY", "Could not claim event id");
  }

  try {
    const kit = await prisma.kit.findFirst({
      where: { id: body.kitId, organizationId: session.organizationId },
      include: {
        lines: { include: { part: true } },
        stagingLocation: true,
        dnaVersion: true,
      },
    });
    if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
    if (!OPEN_SCAN_STATUSES.has(kit.status)) {
      throw new DomainError("INVALID_STATUS", `Cannot scan kit in status ${kit.status}`);
    }

    const dnaConfig = parseDnaConfig(kit.dnaVersion?.configJson);
    const requireLocationFirst = dnaConfig.requireStagingCellBeforeParts !== false;

    let sessionRow = await prisma.scanSession.findFirst({
      where: { kitId: kit.id, operatorId: session.userId },
      orderBy: { lastEventAt: "desc" },
    });
    if (!sessionRow) {
      sessionRow = await prisma.scanSession.create({
        data: {
          kitId: kit.id,
          operatorId: session.userId,
          state: kit.stagingLocationId || !requireLocationFirst ? "EXPECT_PART" : "EXPECT_LOCATION",
        },
      });
    }

    if (body.reset) {
      const g = transitionScan({
        state: sessionRow.state as ScanState,
        event: "RESET",
        requireLocationFirst,
      });
      await prisma.scanSession.update({
        where: { id: sessionRow.id },
        data: {
          state: g.next,
          pendingPartId: null,
          pendingLotId: null,
          lastEventAt: new Date(),
        },
      });
      const resp = {
        ok: true,
        message: g.message,
        prompt: promptForState(g.next),
        state: g.next,
        kit,
      };
      await saveIdempotent(session.organizationId, body.clientEventId, resp);
      return jsonOk(resp);
    }

    const barcode = body.barcode.trim();
    let state = sessionRow.state as ScanState;
    let message = "";
    let stagedKit = null as Awaited<ReturnType<typeof stagePartOnKit>> | null;

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

    async function doStage(args: {
      partId: string;
      qty: number;
      lotId?: string | null;
      serialId?: string | null;
    }) {
      const cellId = kit!.stagingLocationId;
      if (!cellId) throw new DomainError("NO_STAGING_CELL", "No staging cell");
      return stagePartOnKit({
        organizationId: session.organizationId,
        kitId: kit!.id,
        stagingLocationId: cellId,
        partId: args.partId,
        qty: args.qty,
        lotId: args.lotId,
        serialId: args.serialId,
        actorId: session.userId,
      });
    }

    // Resolve by expected state first to reduce barcode ambiguity
    if (state === "EXPECT_LOT" && lot) {
      // handled below
    } else if (state === "EXPECT_SERIAL" && serial) {
      // handled below
    }

    if (location?.type === "STAGING_CELL") {
      const g = transitionScan({ state, event: "SCAN_LOCATION", requireLocationFirst });
      if (!g.ok) throw new DomainError(g.code, g.message);
      state = g.next;
      message = g.message;
      if (!kit.stagingLocationId) {
        await prisma.kit.update({
          where: { id: kit.id },
          data: { stagingLocationId: location.id },
        });
        kit.stagingLocationId = location.id;
      } else if (kit.stagingLocationId !== location.id) {
        message = "Kit already bound to another staging cell. Scan part.";
        state = "EXPECT_PART";
      }
      await prisma.scanSession.update({
        where: { id: sessionRow.id },
        data: { state, lastEventAt: new Date(), pendingPartId: null, pendingLotId: null },
      });
    } else if (
      part &&
      state !== "EXPECT_LOT" &&
      state !== "EXPECT_SERIAL" &&
      (state === "EXPECT_PART" || state === "COMPLETE" || state === "EXPECT_LOCATION")
    ) {
      if (state === "EXPECT_LOCATION" && !kit.stagingLocationId && requireLocationFirst) {
        throw new DomainError("EXPECTED_LOCATION", "Scan staging cell first");
      }
      const g = transitionScan({
        state:
          state === "COMPLETE"
            ? "EXPECT_PART"
            : state === "EXPECT_LOCATION"
              ? "EXPECT_PART"
              : state,
        event: "SCAN_PART",
        tracking: part.tracking,
        requireLocationFirst,
      });
      if (!g.ok) throw new DomainError(g.code, g.message);
      state = g.next;
      message = g.message;

      if (state === "COMPLETE") {
        stagedKit = await doStage({ partId: part.id, qty: body.qty ?? 1 });
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
        requireLocationFirst,
      });
      if (!g.ok) throw new DomainError(g.code, g.message);
      state = g.next;
      message = g.message;

      if (state === "COMPLETE") {
        stagedKit = await doStage({
          partId: pendingPart.id,
          qty: body.qty ?? 1,
          lotId: lot.id,
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
      if (serial.status !== "AVAILABLE" && serial.status !== "RESERVED") {
        throw new DomainError("SERIAL_IN_USE", `Serial status ${serial.status}`);
      }
      let pendingPart = sessionRow.pendingPartId
        ? await prisma.part.findUnique({ where: { id: sessionRow.pendingPartId } })
        : null;
      if (!pendingPart && serial.partId) {
        pendingPart = await prisma.part.findUnique({ where: { id: serial.partId } });
      }
      if (!pendingPart) throw new DomainError("NO_PENDING_PART", "Unknown serial part");
      if (sessionRow.pendingPartId && serial.partId !== sessionRow.pendingPartId) {
        throw new DomainError("SERIAL_PART_MISMATCH", "Serial does not match pending part");
      }
      if (sessionRow.pendingLotId && serial.lotId && serial.lotId !== sessionRow.pendingLotId) {
        throw new DomainError("SERIAL_LOT_MISMATCH", "Serial does not match pending lot");
      }

      if (state === "EXPECT_PART") {
        const gPart = transitionScan({
          state,
          event: "SCAN_PART",
          tracking: pendingPart.tracking,
          requireLocationFirst,
        });
        if (!gPart.ok) throw new DomainError(gPart.code, gPart.message);
        state = gPart.next;
        if (state === "EXPECT_LOT") {
          throw new DomainError("EXPECTED_LOT", "Scan lot before serial for this part");
        }
      }

      const g = transitionScan({
        state: state === "EXPECT_PART" ? "EXPECT_SERIAL" : state,
        event: "SCAN_SERIAL",
        tracking: pendingPart.tracking,
        requireLocationFirst,
      });
      if (!g.ok) throw new DomainError(g.code, g.message);

      stagedKit = await doStage({
        partId: pendingPart.id,
        qty: 1,
        lotId: serial.lotId || sessionRow.pendingLotId,
        serialId: serial.id,
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

    const resp = {
      ok: true,
      message,
      prompt: promptForState(state),
      state,
      kit: fresh,
    };

    await saveIdempotent(session.organizationId, body.clientEventId, resp);
    return jsonOk(resp);
  } catch (e) {
    await prisma.idempotencyKey
      .delete({
        where: {
          organizationId_clientEventId: {
            organizationId: session.organizationId,
            clientEventId: body.clientEventId,
          },
        },
      })
      .catch(() => undefined);
    throw e;
  }
}

async function saveIdempotent(organizationId: string, clientEventId: string, resp: unknown) {
  await prisma.idempotencyKey.update({
    where: {
      organizationId_clientEventId: { organizationId, clientEventId },
    },
    data: { responseJson: JSON.stringify(resp) },
  });
}
