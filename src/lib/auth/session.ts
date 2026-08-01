import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const COOKIE = "km_session";
const secret = () =>
  new TextEncoder().encode(
    process.env.SESSION_SECRET || "kittingmaster-dev-secret-change-me"
  );

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: Role;
  siteId: string | null;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new AuthError("UNAUTHORIZED", "Not signed in");
  return s;
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      memberships: {
        include: { organization: true },
        take: 1,
      },
    },
  });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const m = user.memberships[0];
  if (!m) return null;

  const site = await prisma.site.findFirst({
    where: { organizationId: m.organizationId },
    orderBy: { code: "asc" },
  });

  const session: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    organizationSlug: m.organization.slug,
    role: m.role,
    siteId: site?.id ?? null,
  };
  await createSession(session);
  return session;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}
