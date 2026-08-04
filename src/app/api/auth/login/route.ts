import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginWithPassword } from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Simple in-memory rate limit: 20 attempts / 15 min per IP (best-effort on serverless). */
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, max = 20, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || cur.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (!rateLimit(`login:${ip}`)) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later.", code: "RATE_LIMIT" },
        { status: 429 }
      );
    }

    const body = bodySchema.parse(await req.json());
    const session = await loginWithPassword(body.email, body.password);
    if (!session) {
      return NextResponse.json({ error: "Invalid credentials", code: "INVALID" }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        email: session.email,
        name: session.name,
        organization: session.organizationName,
        role: session.role,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", code: "VALIDATION", details: e.flatten() },
        { status: 400 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL" }, { status: 500 });
  }
}
