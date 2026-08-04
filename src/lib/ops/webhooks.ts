/**
 * Integration webhooks — push kit lifecycle to ERP/MRP.
 * Hardened: HTTPS-only, private IP block, HMAC signing when secret set.
 */

import { createHmac, randomBytes } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";

export type WebhookPayload = {
  event: string;
  organizationId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

function ipIsPrivate(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "0.0.0.0") return true;
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  // IPv4-mapped
  const mapped = v.startsWith("::ffff:") ? v.slice(7) : v;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(mapped);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Validate webhook URL for SSRF safety. Returns normalized https URL or throws.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid webhook URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URL must not include credentials");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Webhook host is not allowed");
  }
  if (isIP(host)) {
    if (ipIsPrivate(host)) throw new Error("Webhook URL must not target private IPs");
  } else {
    const records = await lookup(host, { all: true, verbatim: true }).catch(() => {
      throw new Error("Webhook host could not be resolved");
    });
    for (const r of records) {
      if (ipIsPrivate(r.address)) {
        throw new Error("Webhook host resolves to a private IP");
      }
    }
  }
  return url.toString();
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function signWebhookBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function dispatchWebhook(
  webhookUrl: string | null | undefined,
  payload: WebhookPayload,
  secret?: string | null
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!webhookUrl) return { ok: true, status: 0 };

  try {
    // Re-validate on dispatch (settings may be old)
    await assertSafeWebhookUrl(webhookUrl);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unsafe webhook url",
    };
  }

  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "KittingMaster-Webhook/1.0",
      "X-KittingMaster-Event": payload.event,
      "X-KittingMaster-Timestamp": payload.occurredAt,
    };
    if (secret) {
      headers["X-KittingMaster-Signature"] = `sha256=${signWebhookBody(secret, body)}`;
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error",
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
