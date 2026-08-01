import { requireSession } from "@/lib/auth/session";
import { validateAndSealKit } from "@/lib/kits/service";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
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
