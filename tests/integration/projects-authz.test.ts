import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listMyTenants } from "@/app/api/me/tenants/route";
import { GET as listProjects, POST as createProject } from "@/app/api/tenants/[tenantSlug]/projects/route";
import { PATCH as renameProject } from "@/app/api/tenants/[tenantSlug]/projects/[projectId]/route";
import { db } from "@/server/db";
import { auditCount, params, projectsOf, request, signIn } from "./helpers";

// The authorization matrix from docs/build-spec.md §7.1, against the real handlers, real Better
// Auth sessions and the real tenantdesk_test database. Nothing here is mocked.

let ada: string; // Acme admin (A only)
let ben: string; // Globex editor (B only)
let vic: string; // Acme viewer
let globexProjectId: string;
let acmeProjectId: string;

beforeAll(async () => {
  [ada, ben, vic] = await Promise.all([signIn("ada@acme.test"), signIn("ben@globex.test"), signIn("vic@acme.test")]);
  globexProjectId = (await projectsOf("globex"))[0].id;
  acmeProjectId = (await projectsOf("acme"))[0].id;
});

afterAll(async () => {
  await db.$disconnect();
});

/** Asserts a denied write changed nothing: same projects, same names, no new audit rows. */
async function expectNothingPersisted(write: () => Promise<Response>, status: number) {
  const before = { acme: await projectsOf("acme"), globex: await projectsOf("globex"), audits: await auditCount() };
  const response = await write();
  expect(response.status).toBe(status);
  expect(await projectsOf("acme")).toEqual(before.acme);
  expect(await projectsOf("globex")).toEqual(before.globex);
  expect(await auditCount()).toBe(before.audits);
  return response;
}

describe("1. unauthenticated", () => {
  it("rejects list, create and rename with 401", async () => {
    expect((await listProjects(request("/api/tenants/acme/projects"), params({ tenantSlug: "acme" }))).status).toBe(401);
    await expectNothingPersisted(
      () => createProject(request("/api/tenants/acme/projects", { method: "POST", body: { name: "Nope" } }), params({ tenantSlug: "acme" })),
      401,
    );
    await expectNothingPersisted(
      () =>
        renameProject(
          request(`/api/tenants/acme/projects/${acmeProjectId}`, { method: "PATCH", body: { name: "Nope" } }),
          params({ tenantSlug: "acme", projectId: acmeProjectId }),
        ),
      401,
    );
    expect((await listMyTenants(request("/api/me/tenants"), undefined)).status).toBe(401);
  });

  it("rejects a forged session cookie with 401", async () => {
    const response = await listProjects(
      request("/api/tenants/acme/projects", { cookie: "better-auth.session_token=forged.value" }),
      params({ tenantSlug: "acme" }),
    );
    expect(response.status).toBe(401);
  });
});

describe("cross-tenant access (A → B, B → A)", () => {
  it("2. Ada cannot read Globex's projects (404, same as an unknown tenant)", async () => {
    const response = await listProjects(request("/api/tenants/globex/projects", { cookie: ada }), params({ tenantSlug: "globex" }));
    expect(response.status).toBe(404);
    const unknown = await listProjects(request("/api/tenants/nope/projects", { cookie: ada }), params({ tenantSlug: "nope" }));
    expect(unknown.status).toBe(404);
    expect(await response.json()).toEqual(await unknown.json());
  });

  it("3. Ada cannot create a project in Globex", async () => {
    await expectNothingPersisted(
      () =>
        createProject(
          request("/api/tenants/globex/projects", { method: "POST", cookie: ada, body: { name: "Planted by Ada" } }),
          params({ tenantSlug: "globex" }),
        ),
      404,
    );
  });

  it("4. Ada cannot rename Globex's project via Globex's URL", async () => {
    await expectNothingPersisted(
      () =>
        renameProject(
          request(`/api/tenants/globex/projects/${globexProjectId}`, { method: "PATCH", cookie: ada, body: { name: "Hijacked" } }),
          params({ tenantSlug: "globex", projectId: globexProjectId }),
        ),
      404,
    );
  });

  it("5. Ada cannot rename Globex's project through her own tenant's URL", async () => {
    await expectNothingPersisted(
      () =>
        renameProject(
          request(`/api/tenants/acme/projects/${globexProjectId}`, { method: "PATCH", cookie: ada, body: { name: "Hijacked" } }),
          params({ tenantSlug: "acme", projectId: globexProjectId }),
        ),
      404,
    );
  });

  it("6. Ben cannot read or rename Acme's project", async () => {
    expect((await listProjects(request("/api/tenants/acme/projects", { cookie: ben }), params({ tenantSlug: "acme" }))).status).toBe(404);
    await expectNothingPersisted(
      () =>
        renameProject(
          request(`/api/tenants/acme/projects/${acmeProjectId}`, { method: "PATCH", cookie: ben, body: { name: "Hijacked" } }),
          params({ tenantSlug: "acme", projectId: acmeProjectId }),
        ),
      404,
    );
  });

  it("only lists the caller's own tenants", async () => {
    const response = await listMyTenants(request("/api/me/tenants", { cookie: ada }), undefined);
    expect(await response.json()).toEqual({ tenants: [{ slug: "acme", name: "Acme Corp", role: "admin" }] });
  });
});

describe("viewer", () => {
  it("7. Vic can read Acme's projects", async () => {
    const response = await listProjects(request("/api/tenants/acme/projects", { cookie: vic }), params({ tenantSlug: "acme" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tenant).toEqual({ slug: "acme", name: "Acme Corp", role: "viewer" });
    expect(body.projects.map((p: { name: string }) => p.name)).toContain("Acme Website Revamp");
  });

  it("8. Vic cannot create or rename (403)", async () => {
    await expectNothingPersisted(
      () => createProject(request("/api/tenants/acme/projects", { method: "POST", cookie: vic, body: { name: "Viewer write" } }), params({ tenantSlug: "acme" })),
      403,
    );
    await expectNothingPersisted(
      () =>
        renameProject(
          request(`/api/tenants/acme/projects/${acmeProjectId}`, { method: "PATCH", cookie: vic, body: { name: "Viewer write" } }),
          params({ tenantSlug: "acme", projectId: acmeProjectId }),
        ),
      403,
    );
  });
});

describe("9. invalid input (400, nothing persisted)", () => {
  const cases: Array<[string, { body?: unknown; rawBody?: string }]> = [
    ["empty name", { body: { name: "" } }],
    ["whitespace name", { body: { name: "   " } }],
    ["81 characters", { body: { name: "x".repeat(81) } }],
    ["number", { body: { name: 42 } }],
    ["missing name", { body: {} }],
    ["client-supplied tenantId", { body: { name: "Sneaky", tenantId: "anything" } }],
    ["malformed JSON", { rawBody: "{not json" }],
  ];
  for (const [label, input] of cases) {
    it(`rejects ${label} on create and rename`, async () => {
      const created = await expectNothingPersisted(
        () => createProject(request("/api/tenants/acme/projects", { method: "POST", cookie: ada, ...input }), params({ tenantSlug: "acme" })),
        400,
      );
      expect((await created.json()).error.code).toBe("VALIDATION_ERROR");
      await expectNothingPersisted(
        () =>
          renameProject(
            request(`/api/tenants/acme/projects/${acmeProjectId}`, { method: "PATCH", cookie: ada, ...input }),
            params({ tenantSlug: "acme", projectId: acmeProjectId }),
          ),
        400,
      );
    });
  }

  it("rejects a non-JSON content type with 415", async () => {
    await expectNothingPersisted(
      () =>
        createProject(
          request("/api/tenants/acme/projects", { method: "POST", cookie: ada, rawBody: "name=x", contentType: "application/x-www-form-urlencoded" }),
          params({ tenantSlug: "acme" }),
        ),
      415,
    );
  });
});

describe("authorized writes", () => {
  let createdId: string;

  it("11. Ada creates a project in Acme, with exactly one audit entry", async () => {
    const audits = await auditCount();
    const response = await createProject(
      request("/api/tenants/acme/projects", { method: "POST", cookie: ada, body: { name: "  Q4 Launch  " } }),
      params({ tenantSlug: "acme" }),
    );
    expect(response.status).toBe(201);
    const { project } = await response.json();
    expect(project.name).toBe("Q4 Launch");
    expect(Object.keys(project).sort()).toEqual(["createdAt", "id", "name", "updatedAt"]);
    createdId = project.id;

    const row = await db.project.findUniqueOrThrow({ where: { id: createdId }, include: { tenant: true } });
    expect(row.tenant.slug).toBe("acme");
    expect(await auditCount()).toBe(audits + 1);
    const entries = await db.auditEntry.findMany({ where: { projectId: createdId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tenantId: row.tenantId, actorUserId: "user_ada", action: "project_created", data: { name: "Q4 Launch" } });
  });

  it("12. Ada renames it, with exactly one rename audit entry", async () => {
    const response = await renameProject(
      request(`/api/tenants/acme/projects/${createdId}`, { method: "PATCH", cookie: ada, body: { name: "Q4 Launch v2" } }),
      params({ tenantSlug: "acme", projectId: createdId }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).project.name).toBe("Q4 Launch v2");
    const renames = await db.auditEntry.findMany({ where: { projectId: createdId, action: "project_renamed" } });
    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatchObject({ actorUserId: "user_ada", data: { from: "Q4 Launch", to: "Q4 Launch v2" } });
  });

  it("renaming to the same name is a no-op with no audit entry", async () => {
    await expectNothingPersisted(
      () =>
        renameProject(
          request(`/api/tenants/acme/projects/${createdId}`, { method: "PATCH", cookie: ada, body: { name: "Q4 Launch v2" } }),
          params({ tenantSlug: "acme", projectId: createdId }),
        ),
      200,
    );
  });

  it("10. a duplicate name in the same tenant is 409 (case-insensitive); another tenant may reuse it", async () => {
    const duplicate = await expectNothingPersisted(
      () => createProject(request("/api/tenants/acme/projects", { method: "POST", cookie: ada, body: { name: "q4 LAUNCH v2" } }), params({ tenantSlug: "acme" })),
      409,
    );
    expect((await duplicate.json()).error.code).toBe("NAME_TAKEN");
    const otherTenant = await createProject(
      request("/api/tenants/globex/projects", { method: "POST", cookie: ben, body: { name: "Q4 Launch v2" } }),
      params({ tenantSlug: "globex" }),
    );
    expect(otherTenant.status).toBe(201);
  });

  it("13. atomicity: if the audit insert fails, the rename rolls back", async () => {
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION tenantdesk_test_fail_audit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'audit insert forced to fail by test'; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(
      `CREATE TRIGGER tenantdesk_test_fail_audit BEFORE INSERT ON "AuditEntry" FOR EACH ROW EXECUTE FUNCTION tenantdesk_test_fail_audit()`,
    );
    try {
      const response = await expectNothingPersisted(
        () =>
          renameProject(
            request(`/api/tenants/acme/projects/${createdId}`, { method: "PATCH", cookie: ada, body: { name: "Should roll back" } }),
            params({ tenantSlug: "acme", projectId: createdId }),
          ),
        500,
      );
      const body = await response.json();
      expect(body).toEqual({ error: { code: "INTERNAL", message: "Something went wrong" } });
      const row = await db.project.findUniqueOrThrow({ where: { id: createdId } });
      expect(row.name).toBe("Q4 Launch v2");
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS tenantdesk_test_fail_audit ON "AuditEntry"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS tenantdesk_test_fail_audit()`);
    }
  });
});

describe("database constraints (independent of app code)", () => {
  it("rejects an audit entry whose tenant differs from its project's tenant", async () => {
    const acme = await db.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    await expect(
      db.auditEntry.create({
        data: { tenantId: acme.id, projectId: globexProjectId, actorUserId: "user_ada", action: "project_renamed", data: {} },
      }),
    ).rejects.toThrow();
  });

  it("rejects a blank project name even if app validation were bypassed", async () => {
    const acme = await db.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    await expect(db.project.create({ data: { tenantId: acme.id, name: "   " } })).rejects.toThrow();
  });
});

describe("sign-up is disabled", () => {
  it("doesn't let anyone create an account", async () => {
    const { auth } = await import("@/server/auth");
    const response = await auth.api.signUpEmail({
      body: { email: "mallory@evil.test", password: "mallory-password-123", name: "Mallory" },
      asResponse: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.user.count({ where: { email: "mallory@evil.test" } })).toBe(0);
  });
});
