import { requireRole } from "@/lib/auth/session";
import { SUPERVISOR_ROLES } from "@/lib/auth/roles";
import { validateAndSealKit } from "@/lib/kits/service";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(SUPERVISOR_ROLES, "Supervisor+ required to seal");
    const { id } = await ctx.params;
    const kit = await validateAndSealKit({
      organizationId: session.organizationId,
      kitId: id,
      actorId: session.userId,
    });
    return jsonOk({ kit });
  } catch (e) {
    return jsonError(e);
  }
}
