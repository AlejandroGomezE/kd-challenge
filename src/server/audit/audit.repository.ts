import "server-only";
import type { AuditAction, Prisma } from "../../generated/prisma/client";

export function insertAuditEntry(
  tx: Prisma.TransactionClient,
  entry: { tenantId: string; projectId: string; actorUserId: string; action: AuditAction; data: Prisma.InputJsonValue },
) {
  return tx.auditEntry.create({ data: entry });
}
