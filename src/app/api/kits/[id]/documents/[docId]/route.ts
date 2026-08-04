import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/inventory/ledger";
import { jsonError } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const session = await requireSession();
    const { id, docId } = await ctx.params;
    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        kitId: id,
        organizationId: session.organizationId,
      },
      include: { kit: true },
    });
    if (!doc) throw new DomainError("NOT_FOUND", "Document not found");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${doc.type} · ${doc.kit.kitInstanceCode}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 32px; color: #0f172a; background: #fff; }
    h1 { font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; }
    pre { white-space: pre-wrap; font-size: 12px; line-height: 1.5; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    @media print { button { display: none; } body { padding: 12px; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Print</button>
  <h1>KittingMaster · ${doc.type.replace("_", " ")}</h1>
  <div class="meta">Kit ${doc.kit.kitInstanceCode} · ${doc.createdAt.toISOString()}</div>
  <pre>${escapeHtml(doc.content)}</pre>
  <script>/* auto-open print optional */</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    return jsonError(e);
  }
}

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
