import { requireRole } from "@/lib/auth/session";
import { SUPERVISOR_ROLES } from "@/lib/auth/roles";
import { releaseWave } from "@/lib/ops/waves";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(SUPERVISOR_ROLES, "Supervisor+ required to release waves");
    const { id } = await ctx.params;
    const wave = await releaseWave({
      organizationId: session.organizationId,
      waveId: id,
      actorId: session.userId,
    });
    return jsonOk({ wave });
  } catch (e) {
    return jsonError(e);
  }
}
