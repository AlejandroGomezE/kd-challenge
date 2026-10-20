import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { insertAuditEntry } from "../audit/audit.repository";
import { db } from "../db";
import { AppError } from "../http";
import { requireMembership, type SessionUser } from "../tenancy/tenancy.service";
import * as projects from "./projects.repository";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function nameTaken(): AppError {
  return new AppError("NAME_TAKEN", "A project with this name already exists", {
    name: ["A project with this name already exists"],
  });
}

export async function listTenantProjects(user: SessionUser, tenantSlug: string) {
  const ctx = await requireMembership(user, tenantSlug);
  return { ctx, projects: await projects.listProjects(ctx.tenantId) };
}

/** The project write and its audit entry commit together or not at all. */
export async function createTenantProject(user: SessionUser, tenantSlug: string, name: string) {
  const ctx = await requireMembership(user, tenantSlug, "editor");
  try {
    return await db.$transaction(async (tx) => {
      const project = await projects.createProject(tx, ctx.tenantId, name);
      await insertAuditEntry(tx, {
        tenantId: ctx.tenantId,
        projectId: project.id,
        actorUserId: ctx.userId,
        action: "project_created",
        data: { name },
      });
      return project;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

export async function renameTenantProject(user: SessionUser, tenantSlug: string, projectId: string, name: string) {
  const ctx = await requireMembership(user, tenantSlug, "editor");
  try {
    return await db.$transaction(async (tx) => {
      const current = await projects.findProject(tx, ctx.tenantId, projectId);
      if (!current) throw new AppError("NOT_FOUND", "Project not found");
      if (current.name === name) return current; // no-op: nothing changed, nothing audited
      const project = await projects.renameProject(tx, ctx.tenantId, projectId, name);
      await insertAuditEntry(tx, {
        tenantId: ctx.tenantId,
        projectId: project.id,
        actorUserId: ctx.userId,
        action: "project_renamed",
        data: { from: current.name, to: name },
      });
      return project;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}
