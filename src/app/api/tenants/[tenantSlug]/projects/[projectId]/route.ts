import { projectNameSchema } from "@/lib/schemas/project";
import { handle, json, parseJsonBody } from "@/server/http";
import { toProjectDto } from "@/server/projects/project.dto";
import { renameTenantProject } from "@/server/projects/projects.service";
import { requireSession } from "@/server/tenancy/tenancy.service";

type Context = { params: Promise<{ tenantSlug: string; projectId: string }> };

export const PATCH = handle<Context>(async (request, { params }) => {
  const user = await requireSession(request.headers);
  const { tenantSlug, projectId } = await params;
  const { name } = await parseJsonBody(request, projectNameSchema);
  const project = await renameTenantProject(user, tenantSlug, projectId, name);
  return json({ project: toProjectDto(project) });
});
