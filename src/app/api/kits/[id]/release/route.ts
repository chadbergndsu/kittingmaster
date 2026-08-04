import { requireRole } from "@/lib/auth/session";
import { SUPERVISOR_ROLES } from "@/lib/auth/roles";
import { releaseKit } from "@/lib/kits/service";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(SUPERVISOR_ROLES, "Supervisor+ required to release");
    const { id } = await ctx.params;
    const kit = await releaseKit({
      organizationId: session.organizationId,
      kitId: id,
      actorId: session.userId,
    });
    return jsonOk({ kit });
  } catch (e) {
    return jsonError(e);
  }
}
