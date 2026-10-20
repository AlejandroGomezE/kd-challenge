import "server-only";
import { db } from "../db";

export function findMembershipBySlug(userId: string, tenantSlug: string) {
  return db.membership.findFirst({
    where: { userId, tenant: { slug: tenantSlug } },
    select: { role: true, tenant: { select: { id: true, slug: true, name: true } } },
  });
}

export function listMembershipsForUser(userId: string) {
  return db.membership.findMany({
    where: { userId },
    select: { role: true, tenant: { select: { slug: true, name: true } } },
    orderBy: { tenant: { name: "asc" } },
  });
}
