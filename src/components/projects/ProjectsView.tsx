"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiClient, canWrite, mutationErrorMessage, queryKeys, type Project, type ProjectList, type TenantSummary } from "@/lib/api-client";
import { Alert, Button } from "../ui";
import { ProjectNameForm } from "./ProjectNameForm";
import { TenantSwitcher } from "./TenantSwitcher";

export function ProjectsView({ tenantSlug }: { tenantSlug: string }) {
  const projects = useQuery({
    queryKey: queryKeys.projects(tenantSlug),
    queryFn: () => apiClient.get<ProjectList>(`/api/tenants/${encodeURIComponent(tenantSlug)}/projects`),
  });

  if (projects.isPending) return <ListSkeleton />;

  if (projects.isError) {
    const error = projects.error;
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Organization not found</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">It doesn&apos;t exist, or you&apos;re not a member.</p>
          <Link href="/" className="text-sm underline">
            Back to your organizations
          </Link>
        </div>
      );
    }
    if (error instanceof ApiError && error.status === 401) {
      return (
        <p className="text-sm">
          Your session expired. <Link href="/sign-in" className="underline">Sign in again</Link>.
        </p>
      );
    }
    return <Alert onRetry={() => projects.refetch()}>Couldn&apos;t load projects. {mutationErrorMessage(error)}</Alert>;
  }

  return <ProjectsList tenant={projects.data.tenant} projects={projects.data.projects} />;
}

function ProjectsList({ tenant, projects }: { tenant: TenantSummary; projects: Project[] }) {
  const writer = canWrite(tenant.role);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects(tenant.slug) });
  const [formKey, setFormKey] = useState(0);

  const create = useMutation({
    mutationFn: (name: string) => apiClient.post<{ project: Project }>(`/api/tenants/${tenant.slug}/projects`, { name }),
    onSuccess: () => {
      setFormKey((k) => k + 1); // fresh, empty form
      return invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{tenant.name}</h1>
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700" aria-label={`Your role: ${tenant.role}`}>
            {tenant.role}
          </span>
        </div>
        <TenantSwitcher current={tenant.slug} />
      </header>

      {writer ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">New project</h2>
          <ProjectNameForm
            key={formKey}
            id="new-project-name"
            label="Project name"
            submitLabel="Create"
            pending={create.isPending}
            serverError={create.error}
            onSubmit={(name) => create.mutate(name)}
          />
          {create.isError && !(create.error instanceof ApiError && create.error.fieldErrors) && <Alert>{mutationErrorMessage(create.error)}</Alert>}
        </section>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">You have read-only access to this organization.</p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Projects</h2>
        {projects.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No projects yet.{writer && " Create the first one above."}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {projects.map((project) => (
              <ProjectRow key={project.id} tenantSlug={tenant.slug} project={project} writer={writer} onRenamed={invalidate} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectRow({ tenantSlug, project, writer, onRenamed }: { tenantSlug: string; project: Project; writer: boolean; onRenamed: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const rename = useMutation({
    mutationFn: (name: string) => apiClient.patch<{ project: Project }>(`/api/tenants/${tenantSlug}/projects/${project.id}`, { name }),
    onSuccess: async () => {
      await onRenamed();
      setEditing(false);
    },
  });

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      {editing ? (
        <>
          <ProjectNameForm
            id={`rename-${project.id}`}
            label={`Rename ${project.name}`}
            submitLabel="Save"
            initialName={project.name}
            pending={rename.isPending}
            serverError={rename.error}
            onSubmit={(name) => rename.mutate(name)}
            onCancel={() => {
              rename.reset();
              setEditing(false);
            }}
          />
          {rename.isError && !(rename.error instanceof ApiError && rename.error.fieldErrors) && <Alert>{mutationErrorMessage(rename.error)}</Alert>}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{project.name}</p>
            <p className="text-xs text-zinc-500">Created {new Date(project.createdAt).toLocaleString()}</p>
          </div>
          {writer && (
            <Button variant="secondary" onClick={() => setEditing(true)} aria-label={`Rename ${project.name}`}>
              Rename
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading projects" className="flex flex-col gap-3">
      <div className="h-7 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
      ))}
    </div>
  );
}
