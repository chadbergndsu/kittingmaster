import { prisma } from "@/lib/db";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Health check for platform monitors (Vercel, uptime robots, load balancers).
 * - 200: process + DB OK
 * - 503: DB unreachable (app process may still be up)
 */
export async function GET() {
  const started = Date.now();
  let db: "up" | "down" = "down";
  let dbError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch (err) {
    dbError = err instanceof Error ? err.message : "db_unreachable";
    log.error("health_check_db_failed", { error: dbError });
  }

  const body = {
    status: db === "up" ? "ok" : "degraded",
    service: "kittingmaster",
    time: new Date().toISOString(),
    latencyMs: Date.now() - started,
    checks: {
      database: db,
    },
    ...(dbError && process.env.NODE_ENV !== "production" ? { dbError } : {}),
  };

  return Response.json(body, {
    status: db === "up" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
