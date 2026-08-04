import { describe, expect, it } from "vitest";
import { assertSafeWebhookUrl, signWebhookBody } from "./webhooks";

describe("webhook SSRF guards", () => {
  it("rejects non-https", async () => {
    await expect(assertSafeWebhookUrl("http://example.com/hook")).rejects.toThrow(/HTTPS/);
  });

  it("rejects private IPv4 literals", async () => {
    await expect(assertSafeWebhookUrl("https://127.0.0.1/hook")).rejects.toThrow(/private/);
    await expect(assertSafeWebhookUrl("https://10.0.0.5/hook")).rejects.toThrow(/private/);
    await expect(assertSafeWebhookUrl("https://192.168.1.1/hook")).rejects.toThrow(/private/);
    await expect(assertSafeWebhookUrl("https://169.254.169.254/latest")).rejects.toThrow(/private/);
  });

  it("rejects localhost hostnames", async () => {
    await expect(assertSafeWebhookUrl("https://localhost/hook")).rejects.toThrow();
  });

  it("signs body with HMAC", () => {
    const sig = signWebhookBody("secret", `{"a":1}`);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(signWebhookBody("secret", `{"a":1}`)).toBe(sig);
    expect(signWebhookBody("other", `{"a":1}`)).not.toBe(sig);
  });
});
