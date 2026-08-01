import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { renderPickList } from "@/lib/kits/service";
import { jsonError, jsonOk } from "@/lib/api";
import { DocumentType } from "@prisma/client";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const kit = await prisma.kit.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        kitDefinition: true,
        demand: true,
        lines: { include: { part: true } },
        dnaVersion: true,
      },
    });
    if (!kit) {
      return jsonError(Object.assign(new Error("Not found"), { code: "NOT_FOUND" }));
    }
    const content = renderPickList(kit);
    const doc = await prisma.document.create({
      data: {
        organizationId: session.organizationId,
        kitId: kit.id,
        type: DocumentType.PICK_LIST,
        content,
      },
    });
    if (kit.status === "ALLOCATED" || kit.status === "PENDING") {
      await prisma.kit.update({
        where: { id: kit.id },
        data: { status: "PICKING" },
      });
    }
    return jsonOk({ document: doc, content });
  } catch (e) {
    return jsonError(e);
  }
}
