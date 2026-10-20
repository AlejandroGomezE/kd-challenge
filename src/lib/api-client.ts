// The only place the client talks to the app's API. Same-origin, cookie-authenticated.

export type ApiErrorBody = { error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't reach the server. Check your connection and try again.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? "INTERNAL", error?.message ?? "Something went wrong", error?.fieldErrors);
  }
  return data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

export type Role = "viewer" | "editor" | "admin";
export type TenantSummary = { slug: string; name: string; role: Role };
export type Project = { id: string; name: string; createdAt: string; updatedAt: string };
export type ProjectList = { tenant: TenantSummary; projects: Project[] };

export const canWrite = (role: Role) => role === "editor" || role === "admin";

export const queryKeys = {
  myTenants: ["me", "tenants"] as const,
  projects: (tenantSlug: string) => ["tenants", tenantSlug, "projects"] as const,
};

/** Friendly copy for a failed mutation; the server's message for validation/conflicts. */
export function mutationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  switch (error.status) {
    case 401:
      return "Your session expired. Sign in again.";
    case 403:
      return "You don't have permission to change projects in this organization.";
    case 404:
      return "That project or organization no longer exists, or you don't have access to it.";
    case 0:
    case 400:
    case 409:
      return error.message;
    default:
      return "Something went wrong on our side. Try again.";
  }
}
