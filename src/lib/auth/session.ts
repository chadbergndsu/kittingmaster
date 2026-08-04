import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { assertRole } from "./roles";

const COOKIE = "km_session";
const DEV_FALLBACK = "kittingmaster-dev-secret-change-me";

function secretBytes() {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    return new TextEncoder().encode(DEV_FALLBACK);
  }
  if (process.env.NODE_ENV === "production" && raw === DEV_FALLBACK) {
    throw new Error("SESSION_SECRET must not use the development default in production");
  }
  if (process.env.NODE_ENV === "production" && raw.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  return new TextEncoder().encode(raw);
}

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
    .sign(secretBytes());

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

/** Verify JWT only (fast). Prefer requireSession for mutating paths. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretBytes());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Require a live session revalidated against DB membership + role.
 * Prevents deleted/demoted users from acting on frozen JWT claims.
 */
export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new AuthError("UNAUTHORIZED", "Not signed in");

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: s.userId,
        organizationId: s.organizationId,
      },
    },
    include: {
      organization: true,
      user: true,
    },
  });
  if (!membership) {
    throw new AuthError("UNAUTHORIZED", "Membership revoked");
  }

  return {
    userId: membership.userId,
    email: membership.user.email,
    name: membership.user.name,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    role: membership.role,
    siteId: s.siteId,
  };
}

export async function requireRole(allowed: Role[], message?: string): Promise<SessionPayload> {
  const session = await requireSession();
  assertRole(session.role, allowed, message);
  return session;
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      memberships: {
        include: { organization: true },
        orderBy: { organizationId: "asc" },
        take: 1,
      },
    },
  });
  // Constant-time-ish: always compare something to avoid pure email enumeration via early return timing
  const hash = user?.passwordHash ?? "$2a$10$invalidhashpaddingxxxxxxxxxxxxxxxxxxxxxxx";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) return null;
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

// re-export for convenience (roles used with requireRole)
export { assertRole } from "./roles";
