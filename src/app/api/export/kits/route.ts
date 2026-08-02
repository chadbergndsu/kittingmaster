import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";

/** CSV export for ERP/MRP integration — market requirement. */
export async function GET() {
  try {
    const session = await requireSession();
    const kits = await prisma.kit.findMany({
      where: { organizationId: session.organizationId },
      include: {
        kitDefinition: true,
        demand: true,
        stagingLocation: true,
        dnaVersion: true,
        lines: { include: { part: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const headers = [
      "kit_instance",
      "status",
      "definition_code",
      "demand_type",
      "external_ref",
      "priority",
      "due_at",
      "staging_cell",
      "seal",
      "dna_version",
      "required_qty",
      "staged_qty",
      "created_at",
      "sealed_at",
      "exception_reason",
    ];

    const rows = kits.map((k) => {
      const required = k.lines.reduce((a, l) => a + l.requiredQty, 0);
      const staged = k.lines.reduce((a, l) => a + l.stagedQty, 0);
      return [
        k.kitInstanceCode,
        k.status,
        k.kitDefinition.code,
        k.demand?.type ?? "",
        k.demand?.externalRef ?? "",
        String(k.demand?.priority ?? ""),
        k.demand?.dueAt?.toISOString() ?? "",
        k.stagingLocation?.code ?? "",
        k.sealFingerprint?.slice(0, 12) ?? "",
        k.dnaVersion.version,
        String(required),
        String(staged),
        k.createdAt.toISOString(),
        k.sealedAt?.toISOString() ?? "",
        (k.exceptionReason ?? "").replaceAll(",", ";"),
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kittingmaster-kits-${Date.now()}.csv"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
