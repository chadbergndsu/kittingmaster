import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream for live kit board updates.
 * Emits counts, kit deltas, and audit events on a short poll interval.
 */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const orgId = session.organizationId;
  let lastAuditAt = new Date(0);
  let lastKitUpdatedAt = new Date(0);
  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("hello", { orgId, at: new Date().toISOString() });

      const tick = async () => {
        if (closed) return;
        try {
          const [audits, kits, counts] = await Promise.all([
            prisma.auditEvent.findMany({
              where: {
                organizationId: orgId,
                createdAt: { gt: lastAuditAt },
              },
              orderBy: { createdAt: "asc" },
              take: 20,
            }),
            prisma.kit.findMany({
              where: {
                organizationId: orgId,
                updatedAt: { gt: lastKitUpdatedAt },
              },
              include: {
                kitDefinition: true,
                demand: true,
                stagingLocation: true,
                lines: true,
              },
              orderBy: { updatedAt: "asc" },
              take: 30,
            }),
            prisma.kit.groupBy({
              by: ["status"],
              where: { organizationId: orgId },
              _count: { _all: true },
            }),
          ]);

          if (audits.length) {
            lastAuditAt = audits[audits.length - 1].createdAt;
            send("audit", { items: audits });
          }
          if (kits.length) {
            lastKitUpdatedAt = kits[kits.length - 1].updatedAt;
            send("kits", { items: kits });
          }

          const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
          send("counts", { counts: statusCounts, at: new Date().toISOString() });
        } catch (e) {
          send("error", { message: e instanceof Error ? e.message : "poll failed" });
        }
      };

      void tick();
      // 8s poll to reduce DB load vs 2.5s; still live enough for floor board
      interval = setInterval(() => void tick(), 8000);
      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(enc.encode(`: ping\n\n`));
          } catch {
            closed = true;
          }
        }
      }, 20000);

      // Hard cap stream lifetime (serverless-friendly)
      setTimeout(
        () => {
          closed = true;
          if (interval) clearInterval(interval);
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        10 * 60 * 1000
      );
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
