import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { DomainError } from "@/lib/inventory/ledger";

/**
 * Protected reseed for demos. Set SEED_SECRET in env.
 * POST /api/admin/seed  header: x-seed-secret: <SEED_SECRET>
 *
 * Note: full seed runs via CLI; this endpoint only reports readiness
 * and optionally triggers a lightweight health check so ops can verify.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.SEED_SECRET;
    if (!secret) {
      throw new DomainError("NOT_CONFIGURED", "SEED_SECRET is not set");
    }
    const provided = req.headers.get("x-seed-secret");
    if (provided !== secret) {
      throw new DomainError("FORBIDDEN", "Invalid seed secret");
    }

    return jsonOk({
      ok: true,
      message:
        "Seed secret accepted. Run `npm run db:seed` with production DATABASE_URL from CI/ops shell to reseed. Full in-process reseed is intentionally CLI-only to avoid accidental wipes.",
      demoLogin: "demo@kittingmaster.app",
    });
  } catch (e) {
    return jsonError(e);
  }
}
