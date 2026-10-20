import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";

// Every function takes tenantId: no tenant-owned row is ever looked up by id alone.

export function listProjects(tenantId: string) {
  return db.project.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export function findProject(tx: Prisma.TransactionClient, tenantId: string, projectId: string) {
  return tx.project.findFirst({ where: { id: projectId, tenantId } });
}

export function createProject(tx: Prisma.TransactionClient, tenantId: string, name: string) {
  return tx.project.create({ data: { tenantId, name } });
}

export function renameProject(tx: Prisma.TransactionClient, tenantId: string, projectId: string, name: string) {
  return tx.project.update({ where: { tenantId_id: { tenantId, id: projectId } }, data: { name } });
}
