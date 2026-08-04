import type { Role } from "@prisma/client";
import { AuthError } from "@/lib/auth/session";

/** Roles that may mutate operational inventory / kits. */
export const OPERATOR_ROLES: Role[] = ["OWNER", "ADMIN", "PLANNER", "OPERATOR", "SUPERVISOR"];

/** Roles that may plan waves, create kits, manage catalog. */
export const PLANNER_ROLES: Role[] = ["OWNER", "ADMIN", "PLANNER", "SUPERVISOR"];

/** Roles that may seal / release / exception / cycle count. */
export const SUPERVISOR_ROLES: Role[] = ["OWNER", "ADMIN", "SUPERVISOR"];

/** Roles that may change org settings / DNA publish. */
export const ADMIN_ROLES: Role[] = ["OWNER", "ADMIN"];

/** Roles that may export sensitive operational data. */
export const EXPORT_ROLES: Role[] = ["OWNER", "ADMIN", "PLANNER", "SUPERVISOR"];

export function assertRole(role: Role, allowed: Role[], message = "Insufficient role") {
  if (!allowed.includes(role)) {
    throw new AuthError("FORBIDDEN", message);
  }
}

export function isRole(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}
