import { getSession } from "@/lib/auth/session";
import { jsonOk } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return jsonOk({ user: session });
}
