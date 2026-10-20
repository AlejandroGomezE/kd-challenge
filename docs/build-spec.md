# TenantDesk — build spec

A tiny project tracker for two organizations: one working, tested, deployed vertical slice of
multi-tenant authorization. This document is the source of truth for **what** gets built during
the timed assessment and **how it will be judged**. Architecture conventions live in
[`knowledge/`](../knowledge/README.md); the feature workflow lives in [`.claude/`](../.claude/README.md).

> **Ground rule.** Nothing in §3–§9 is implemented before the timer starts. Only §2 (starting
> conditions) is done in advance, and it is recorded in
> [`docs/starting-conditions.md`](starting-conditions.md).

---

## 1. Stack (decided)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js** (App Router), React, strict TypeScript | One app at the repo root; Node.js runtime for every route (`export const runtime = 'nodejs'` where relevant — never Edge). |
| Auth | **Better Auth**, email + password | DB-backed sessions in our Postgres via the Prisma adapter. Sign-up disabled (no invitations in scope). |
| ORM / migrations | **Prisma** + `prisma migrate` | Committed `prisma/migrations/`. Raw SQL inside a migration for anything Prisma can't express (expression indexes, triggers, RLS). |
| Database | **PostgreSQL on Neon**, provisioned through Vercel (Marketplace → Neon integration) for the preview; local Postgres (Docker) for dev/tests | Integration injects pooled `DATABASE_URL` (runtime) and `DATABASE_URL_UNPOOLED` (migrations). |
| Client data | TanStack Query over the app's own route handlers | Route handlers are the API — curl-able by the reviewer. |
| Validation | Zod, one schema shared by client form and server handler | Server is authoritative. |
| UI | shadcn/ui + Tailwind | No elaborate visual design. |
| Tests | Vitest (integration, real Postgres) + Playwright (browser + API smoke) | See §7. |
| Hosting | **Vercel** preview deployment, DB on **Neon** via the Vercel integration | §8. |

## 2. Starting conditions (pre-timer, unscored)

Done and recorded **before** the timer, kept to a standard starter so conditions stay comparable:

1. Archive/remove the previous NestJS + Vite starter (`backend/`, `frontend/`, `compose.yaml`
   services, `Runbook.md` content) — record the commit SHA it lived at.
2. `npx create-next-app@latest` (TypeScript, App Router, Tailwind, ESLint, `src/` dir) at the repo
   root. Record the exact Next.js / React versions.
3. Better Auth's standard Next.js email+password setup: `src/server/auth.ts`, the
   `app/api/auth/[...all]/route.ts` handler, a plain sign-in page, Prisma adapter, Better Auth's
   generated tables (`user`, `session`, `account`, `verification`) as the **only** migration.
4. Local Postgres (`compose.yaml` with one `postgres` service; databases `tenantdesk` and
   `tenantdesk_test`). Vitest + Playwright installed with one trivial passing test each.
5. Vercel project linked, Neon database added through Vercel's Neon integration (Storage → Neon), Deployment Protection **off for previews** (or a
   bypass link prepared for the reviewer), the starter deployed once and reachable.
6. Verified: editor, Claude Code, `psql` against local + Neon, `vercel` CLI login, `gh` auth.

Record in `docs/starting-conditions.md`: starter commands, versions, commit SHA at timer start,
preview URL of the bare starter, and an honest list of what existed (including this spec and the
`.claude/` workflow, which were prepared with AI assistance before the timer).

**Not** pre-timer: tenants, memberships, roles, projects, audit, seed data, authorization code,
the projects UI, tests beyond the trivial ones.

---

## 3. Domain & data model

### 3.1 Tables (beyond Better Auth's)

```prisma
enum Role { viewer editor admin }
enum AuditAction { project_created project_renamed }

model Tenant {
  id        String   @id @default(cuid())
  slug      String   @unique            // URL segment, e.g. "acme"
  name      String
  createdAt DateTime @default(now())
  memberships Membership[]
  projects    Project[]
  auditEntries AuditEntry[]
}

model Membership {
  tenantId  String
  userId    String
  role      Role
  createdAt DateTime @default(now())
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId],   references: [id], onDelete: Cascade)
  @@id([tenantId, userId])
  @@index([userId])                     // "which tenants am I in?"
}

model Project {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  auditEntries AuditEntry[]
  @@unique([tenantId, id])              // target of the composite FK below
  @@index([tenantId, createdAt])        // the list query
}

model AuditEntry {
  id          String      @id @default(cuid())
  tenantId    String
  projectId   String
  actorUserId String
  action      AuditAction
  data        Json                       // { name } on create, { from, to } on rename
  createdAt   DateTime    @default(now())
  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [tenantId, projectId], references: [tenantId, id], onDelete: Cascade)
  actor   User    @relation(fields: [actorUserId], references: [id], onDelete: Restrict)
  @@index([tenantId, createdAt])
  @@index([tenantId, projectId])
}
```

### 3.2 Tenant-aware constraints (raw SQL in the same migration)

- `CREATE UNIQUE INDEX project_tenant_name_ci ON "Project" ("tenantId", lower("name"));` — a
  name is unique **within** a tenant, case-insensitively; two tenants may share a name.
- `ALTER TABLE "Project" ADD CONSTRAINT project_name_len CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);`
  — the DB rejects what validation would, as a last line of defense.
- The composite FK `AuditEntry(tenantId, projectId) → Project(tenantId, id)` makes it
  **impossible** to write an audit row whose tenant differs from its project's tenant.
- Membership's PK `(tenantId, userId)` makes double membership impossible.

### 3.3 RLS vs application authorization — decision

**Application authorization is the boundary; the database enforces tenant consistency.** Every
read and write goes through one choke point (`requireMembership`, §5) and every repository
query is scoped by `tenantId` taken from the resolved membership — never from the request body.
The composite FK and per-tenant unique index stop cross-tenant data shapes even if a query is
wrong.

**RLS is a stretch goal** (§10), not part of the core slice: with Prisma it needs a non-owner DB
role, `FORCE ROW LEVEL SECURITY`, and `set_config('app.tenant_id', …, true)` inside every
transaction (reads included), which is real work for a timed slice. If time allows, it's added on
`Project` and `AuditEntry` as defense in depth and the README says **both**. Either way the
README states exactly which one shipped — never claim RLS that isn't enforced in the deployed DB.

## 4. Seed

`prisma/seed.ts` (`npx prisma db seed`), idempotent (upsert by email / slug / tenant+name):

| User | Email | Memberships |
|---|---|---|
| Ada | `ada@acme.test` | Acme → `admin` (only A) |
| Ben | `ben@globex.test` | Globex → `editor` (only B) |
| Vic | `vic@acme.test` | Acme → `viewer` |

| Tenant | Slug | Project |
|---|---|---|
| Acme Corp (A) | `acme` | "Acme Website Revamp" |
| Globex Inc (B) | `globex` | "Globex Data Migration" |

- Passwords come from `SEED_USER_PASSWORD` (env, never committed). Users are created through
  Better Auth's server API / its exported password hasher so hashes match what sign-in verifies —
  never a hand-rolled hash.
- Seeding the preview DB is a manual, logged step (§8). The reviewer gets the password via a
  **private** channel; the repo only says "credentials supplied privately".
- Test data only: `.test` domains, no real names/emails/customer data.

## 5. Authorization model

- **Identity** — resolved on the server on every request: `auth.api.getSession({ headers })`.
  No session → **401**. Nothing from the client identifies the user.
- **Active tenant** — the client *requests* a tenant via the URL (`/t/[tenantSlug]/…`,
  `/api/tenants/[tenantSlug]/…`). The server resolves `Membership` for `(session.user.id,
  tenant.slug)`. No membership (or no such tenant) → **404** — same response for both, so tenant
  existence doesn't leak. A `tenantId` in a body/query is ignored (schemas are `.strict()`, so it's
  a 400).
- **Roles** — `viewer`: read. `editor`, `admin`: read + write. (`admin` has no extra powers in this
  slice — no member management.) Insufficient role → **403**.
- **Object scoping** — `projectId` lookups are always `where: { id, tenantId }`. A project from
  another tenant under your own tenant's URL → **404**.
- **Proxy** (`src/proxy.ts`, Next 16's renamed middleware) may redirect signed-out page visits for
  UX; it is **never** an authorization layer. Every route handler and server component checks for itself.
- **CSRF** — writes require `Content-Type: application/json` (rejected otherwise, 415); session
  cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production (Better Auth defaults).

Choke point, `src/server/tenancy/tenancy.service.ts`:

```ts
requireSession(headers): Promise<SessionUser>                       // 401
requireMembership(user, tenantSlug, minRole?): Promise<TenantContext> // 404 / 403
// TenantContext = { tenantId, tenantSlug, userId, role }
```

## 6. Features

### 6.1 API (route handlers, Node runtime)

| Method & path | Who | Success | Body |
|---|---|---|---|
| `GET /api/tenants/:slug/projects` | any member | 200 `{ projects: ProjectDto[] }` newest first | — |
| `POST /api/tenants/:slug/projects` | editor, admin | 201 `{ project }` + audit `project_created` | `{ name }` |
| `PATCH /api/tenants/:slug/projects/:projectId` | editor, admin | 200 `{ project }` + audit `project_renamed` | `{ name }` |
| `GET /api/me/tenants` | signed in | 200 `{ tenants: [{ slug, name, role }] }` | — |

`ProjectDto = { id, name, createdAt, updatedAt }` — an explicit mapper, never a raw Prisma row.
`name`: trimmed, 1–80 chars. Renaming to the same name is a no-op 200 with **no** audit entry.

Error shape, always: `{ error: { code, message, fieldErrors? } }` —
400 `VALIDATION_ERROR` (incl. malformed JSON / unknown fields), 401 `UNAUTHENTICATED`,
403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `NAME_TAKEN` (unique index, P2002), 415
`UNSUPPORTED_MEDIA_TYPE`, 500 `INTERNAL` (no stack traces or SQL in the body).

### 6.2 Atomic write + audit

`ProjectsService.create/rename` run inside **one** `prisma.$transaction(async (tx) => …)`:
mutate the project, then insert the `AuditEntry` with the same `tx`. If the audit insert fails,
the project change rolls back. Repositories accept an optional `tx` client.

### 6.3 UI

- `/sign-in` — email + password (Better Auth client). Error on bad credentials; pending state.
- `/` — signed in: list my tenants (from `/api/me/tenants`) with my role; one tenant → redirect.
- `/t/[tenantSlug]/projects` — tenant name + my role badge, tenant switcher, project list,
  "New project" form, inline rename per row. Sign-out button.
- Required React states:
  - **Pending** — skeleton on list load; submit buttons disabled with a spinner while mutating.
  - **Empty** — "No projects yet" (+ create CTA for writers only).
  - **Validation** — Zod inline field errors before submit; server `fieldErrors` mapped back.
  - **Failure** — list load error with Retry; mutation error alert (403/404/409/500 messages).
  - **Viewer** — write controls hidden *and* the server still rejects (UI hiding is not the
    control).
  - **Not a member** — the page renders a 404, not an empty list.

## 7. Tests (must run green, exact commands + output go in the README)

### 7.1 Integration — Vitest against real Postgres (`npm run test:integration`)

`tests/integration/`, DB `tenantdesk_test`: global setup runs `prisma migrate reset --force` +
seed; files run serially. Each test signs in for real through Better Auth
(`auth.api.signInEmail(..., { asResponse: true })` → `set-cookie`) and invokes the **real
exported route handlers** with a `Request` carrying that cookie. No mocked auth, no mocked DB.

Required matrix (each write case also asserts **nothing persisted and no audit row**):

| # | Case | Expect |
|---|---|---|
| 1 | No cookie → GET / POST / PATCH | 401 ×3 |
| 2 | Ada (A only) GET Globex projects | 404 |
| 3 | Ada POST into Globex | 404, Globex unchanged |
| 4 | Ada PATCH Globex project via `/tenants/globex/...` | 404 |
| 5 | Ada PATCH Globex project via `/tenants/acme/projects/<globexId>` | 404 |
| 6 | Ben (B only) GET / PATCH Acme | 404 |
| 7 | Vic (viewer) GET Acme | 200 |
| 8 | Vic POST / PATCH in Acme | 403 ×2 |
| 9 | Invalid input: `""`, whitespace, 81 chars, number, missing, extra `tenantId`, malformed JSON | 400 each |
| 10 | Duplicate name in same tenant (case-insensitive) | 409; same name in other tenant is allowed |
| 11 | Ada creates a project in Acme | 201, row has `tenantId = acme`, exactly 1 `project_created` audit with actor Ada |
| 12 | Ada renames it | 200, exactly 1 `project_renamed` audit `{ from, to }` |
| 13 | Atomicity: a temporary DB trigger makes `AuditEntry` inserts raise → rename | 500, project name unchanged, no audit row; trigger dropped in `finally` |

### 7.2 Unit — Vitest (`npm test`)

Zod schemas; `requireMembership` role logic with a mocked repository; error → response mapper.

### 7.3 Browser / API smoke — Playwright (`npm run test:e2e`)

Against `next build && next start` on the test DB: Ada signs in → sees Acme → creates + renames →
sees it. Ada navigates to `/t/globex/projects` → 404 page. Vic sees no write controls; Vic's
`request.post` with her cookie → 403. Signed-out visit → redirected to sign-in.

### 7.4 Preview smoke — `scripts/smoke-authz <BASE_URL>`

curl script the reviewer can run against the deployed preview: signs in as Ada / Vic (password
from env), asserts 404 on Globex, 403 on viewer write, 401 without cookie. Its output is pasted
into the submission.

## 8. Deployment (Vercel + Neon via the Vercel integration)

- One Neon project, created from the Vercel dashboard so env vars are wired automatically; the
  Preview environment points at it (optionally a Neon branch per preview — not required).
  Prisma uses `@prisma/adapter-pg` with the pooled URL at runtime.
- Build command: `prisma generate && prisma migrate deploy && next build` (migrations use
  `DATABASE_URL_UNPOOLED`).
- Env (Preview): `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (from the Neon integration),
  `BETTER_AUTH_SECRET` (generated, never committed), `BETTER_AUTH_URL` = the stable preview
  alias; trusted origins include it.
- Seed during the Vercel build (`scripts/vercel-build`): idempotent, runs only when
  `SEED_USER_PASSWORD` is set for the environment (stored as a Sensitive Vercel variable).
  *Changed during the build:* the original plan (seed from a local shell after `vercel env pull`)
  can't work because the Neon integration's variables are Sensitive and `vercel env pull` returns
  placeholders for them.
- Deployment Protection off for the preview, or share a bypass link privately.
- If deployment fails: keep the repo, write reproduction commands and the exact failure output
  (build log excerpt) in the submission — don't paper over it.

## 9. Submission package

`README.md` (rewritten for TenantDesk) must contain:

1. Repo URL + **commit SHA** being submitted; preview URL.
2. Setup: prerequisites, `cp .env.example .env`, `docker compose up -d`, `npm ci`,
   `npx prisma migrate deploy`, `npx prisma db seed`, `npm run dev`.
3. "Test logins: supplied privately" + which user is which role/tenant.
4. Tests: exact commands and pasted results (`N files / M tests passed`), incl. preview smoke.
5. Authorization explanation: app-level vs RLS (§3.3), the 401/403/404 policy and why 404 for
   non-members.
6. Limitations, honestly: no invitations/sign-up, no member management, admin = editor, no
   pagination, no audit UI, no rate limiting, single region, whatever else is true at the end.

`docs/ai-log.md` (kept **during** the session, see `.claude/CONVENTIONS.md` §11):

- The initial prompt (verbatim), ≥2 follow-up prompts with the relevant response or diff
  excerpt, ≥1 correction or rejected suggestion **or the explicit statement that none occurred**,
  and the checks Alejandro personally performed (manual cross-tenant attempt, viewer write, DB
  inspection of audit rows, reading the migration SQL).
- Never fabricate an entry. Redact secrets, cookies, connection strings.

## 10. Priority & cut line

Build in this order; stop adding at the cut line if time runs short and document what's missing.

1. Schema + migration + constraints + seed (§3–4)
2. Authorization choke point + API (§5, §6.1–6.2)
3. Integration test matrix green (§7.1)
4. UI with all required states (§6.3)
5. Deploy preview + seed + smoke (§7.4, §8)
6. README + AI log (§9)
— **cut line** —
7. Playwright smoke (§7.3), unit tests (§7.2)
8. RLS on `Project` / `AuditEntry` (§3.3), append-only audit (revoke UPDATE/DELETE via trigger)

## 11. Out of scope

Billing, email, file uploads, invitations, sign-up, member/role management, password reset,
audit log UI, pagination, search, elaborate visual design, production data or secrets.
