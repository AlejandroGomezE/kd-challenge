import { auth } from "@/server/auth";
import { db } from "@/server/db";

const BASE = "http://localhost:3000";

export async function signIn(email: string): Promise<string> {
  const response = await auth.api.signInEmail({
    body: { email, password: process.env.SEED_USER_PASSWORD! },
    asResponse: true,
  });
  if (response.status !== 200) throw new Error(`sign-in failed for ${email}: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function request(path: string, init: { method?: string; cookie?: string; body?: unknown; rawBody?: string; contentType?: string } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", init.cookie);
  const hasBody = init.body !== undefined || init.rawBody !== undefined;
  if (hasBody) headers.set("content-type", init.contentType ?? "application/json");
  return new Request(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

export async function tenantBySlug(slug: string) {
  return db.tenant.findUniqueOrThrow({ where: { slug } });
}

export async function projectsOf(slug: string) {
  const tenant = await tenantBySlug(slug);
  return db.project.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
}

export async function auditCount() {
  return db.auditEntry.count();
}
