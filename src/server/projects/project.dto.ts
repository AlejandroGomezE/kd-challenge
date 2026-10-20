import "server-only";
import type { Project } from "../../generated/prisma/client";

export type ProjectDto = { id: string; name: string; createdAt: string; updatedAt: string };

export function toProjectDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
