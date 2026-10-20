import { projectNameSchema } from "@/lib/schemas/project";
import { handle, json, parseJsonBody } from "@/server/http";
import { toProjectDto } from "@/server/projects/project.dto";
import { createTenantProject, listTenantProjects } from "@/server/projects/projects.service";
import { requireSession } from "@/server/tenancy/tenancy.service";

type Context = { params: Promise<{ tenantSlug: string }> };

export const GET = handle<Context>(async (request, { params }) => {
  const user = await requireSession(request.headers);
  const { tenantSlug } = await params;
  const { ctx, projects } = await listTenantProjects(user, tenantSlug);
  return json({
    tenant: { slug: ctx.tenantSlug, name: ctx.tenantName, role: ctx.role },
    projects: projects.map(toProjectDto),
  });
});

export const POST = handle<Context>(async (request, { params }) => {
  const user = await requireSession(request.headers);
  const { tenantSlug } = await params;
  const { name } = await parseJsonBody(request, projectNameSchema);
  const project = await createTenantProject(user, tenantSlug, name);
  return json({ project: toProjectDto(project) }, 201);
});
