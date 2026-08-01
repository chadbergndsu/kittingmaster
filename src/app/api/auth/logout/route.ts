import { destroySession } from "@/lib/auth/session";
import { jsonOk } from "@/lib/api";

export async function POST() {
  await destroySession();
  return jsonOk({ ok: true });
}
