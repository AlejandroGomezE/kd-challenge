import "server-only";
import type { Role } from "../../generated/prisma/client";
import { auth } from "../auth";
import { AppError } from "../http";
import { findMembershipBySlug, listMembershipsForUser } from "./membership.repository";

export type SessionUser = { id: string; email: string; name: string };

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userId: string;
  role: Role;
};

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

/** Identity is resolved on the server from the Better Auth session — never from the client. */
export async function requireSession(headers: Headers): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required");
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/**
 * The URL's tenant slug is a request, not authorization: it is honoured only if the session user
 * has a membership there. Unknown tenant and non-member both give 404, so existence doesn't leak.
 */
export async function requireMembership(user: SessionUser, tenantSlug: string, minRole: Role = "viewer"): Promise<TenantContext> {
  const membership = await findMembershipBySlug(user.id, tenantSlug);
  if (!membership) throw new AppError("NOT_FOUND", "Tenant not found");
  if (RANK[membership.role] < RANK[minRole]) {
    throw new AppError("FORBIDDEN", `This action requires the ${minRole} role`);
  }
  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    tenantName: membership.tenant.name,
    userId: user.id,
    role: membership.role,
  };
}

export async function listMyTenants(user: SessionUser) {
  const memberships = await listMembershipsForUser(user.id);
  return memberships.map((m) => ({ slug: m.tenant.slug, name: m.tenant.name, role: m.role }));
}
