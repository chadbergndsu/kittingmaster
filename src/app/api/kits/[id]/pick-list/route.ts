import { requireRole } from "@/lib/auth/session";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { renderPickList, DomainError } from "@/lib/kits/service";
import { jsonError, jsonOk } from "@/lib/api";
import { DocumentType } from "@prisma/client";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(OPERATOR_ROLES);
    const { id } = await ctx.params;
    const result = await prisma.$transaction(async (tx) => {
      const kit = await tx.kit.findFirst({
        where: { id, organizationId: session.organizationId },
        include: {
          kitDefinition: true,
          demand: true,
          lines: { include: { part: true } },
          dnaVersion: true,
        },
      });
      if (!kit) throw new DomainError("NOT_FOUND", "Kit not found");
      const content = renderPickList(kit);
      const doc = await tx.document.create({
        data: {
          organizationId: session.organizationId,
          kitId: kit.id,
          type: DocumentType.PICK_LIST,
          content,
        },
      });
      if (kit.status === "ALLOCATED" || kit.status === "PENDING") {
        await tx.kit.update({
          where: { id: kit.id },
          data: { status: "PICKING" },
        });
      }
      return { document: doc, content };
    });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e);
  }
}
