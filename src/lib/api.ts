import { NextResponse } from "next/server";
import { DomainError } from "@/lib/inventory/ledger";
import { AuthError } from "@/lib/auth/session";
import { captureError } from "@/lib/observability";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(err: unknown, fallback = "Internal error") {
  if (err instanceof DomainError) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "FORBIDDEN" || err.code === "UNAUTHORIZED"
          ? 403
          : 409;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  if (err instanceof AuthError) {
    const status = err.code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: string; message: string };
    const status =
      e.code === "NOT_FOUND"
        ? 404
        : e.code === "UNAUTHORIZED"
          ? 401
          : e.code === "FORBIDDEN"
            ? 403
            : 409;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  captureError(err, { surface: "api" });
  return NextResponse.json({ error: fallback, code: "INTERNAL" }, { status: 500 });
}
