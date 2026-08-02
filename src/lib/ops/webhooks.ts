/**
 * Integration webhooks — market WMS products push kit lifecycle to ERP/MRP.
 * Fire-and-forget with timeout; failures are audited but do not block ops.
 */

export type WebhookPayload = {
  event: string;
  organizationId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

export async function dispatchWebhook(
  webhookUrl: string | null | undefined,
  payload: WebhookPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!webhookUrl) return { ok: true, status: 0 };

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KittingMaster-Webhook/1.0",
        "X-KittingMaster-Event": payload.event,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "webhook failed",
    };
  }
}
