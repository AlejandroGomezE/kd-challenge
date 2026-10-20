import { Suspense } from "react";
import { ProjectsView } from "@/components/projects/ProjectsView";

// With cacheComponents, request data (params) is read inside a Suspense boundary so the shell can
// prerender. Authorization happens in the API the view calls, never here.
export default function TenantProjectsPage({ params }: PageProps<"/t/[tenantSlug]/projects">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <TenantProjects params={params} />
      </Suspense>
    </main>
  );
}

async function TenantProjects({ params }: { params: PageProps<"/t/[tenantSlug]/projects">["params"] }) {
  const { tenantSlug } = await params;
  return <ProjectsView tenantSlug={tenantSlug} />;
}
