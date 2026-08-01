import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginWithPassword } from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const session = await loginWithPassword(body.email, body.password);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid credentials", code: "INVALID" },
        { status: 401 }
      );
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
