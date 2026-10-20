# TenantDesk

A tiny project tracker for two organizations: one vertical slice of multi-tenant authorization.
Signed-in members list, create and rename projects in their organization. Viewers read, editors
and admins write, and every write is audited atomically.

**Stack:** Next.js 16 (App Router, Node runtime), React 19, strict TypeScript, Better Auth 1.7
(email + password, DB sessions), Prisma 7 + PostgreSQL, Neon (through Vercel) in the cloud, Docker
Postgres locally, TanStack Query, Zod, Vitest, Playwright.

## Submission

| | |
|---|---|
| Repository | https://github.com/AlejandroGomezE/kd-challenge |
| Commit | `e669357e4fe42ab6bdceb807354aee3f054c01d1` (merge of PR #1 — the deployed code); later commits on `main` are docs-only |
| Deployed app | https://kd-challenge.vercel.app |
| Test logins | **Supplied privately** (one shared password for the three seed users below) |
| Spec | [`docs/build-spec.md`](docs/build-spec.md) |
| AI log | [`docs/ai-log.md`](docs/ai-log.md) |
| Starting conditions | [`docs/starting-conditions.md`](docs/starting-conditions.md) |

### Seed users

| User | Email | Access |
|---|---|---|
| Ada | `ada@acme.test` | **Acme Corp** (tenant A): `admin`. Only A. |
| Ben | `ben@globex.test` | **Globex Inc** (tenant B): `editor`. Only B. |
| Vic | `vic@acme.test` | **Acme Corp**: `viewer` (read-only) |

Projects: Acme has "Acme Website Revamp", Globex has "Globex Data Migration". Sign-up is
disabled; accounts exist only through the seed.

**What the reviewer will try:**
- **Ada → Globex.** Sign in as Ada and open `/t/globex/projects`: you get "Organization not found".
  `GET /api/tenants/globex/projects` returns 404, and so does `PATCH
  /api/tenants/acme/projects/<globex-project-id>`.
- **Viewer write.** Sign in as Vic: no write controls are shown, and `POST
  /api/tenants/acme/projects` returns 403.
- **Scripted:** `scripts/smoke-authz <url>` runs these attacks, plus more, from a shell.

---

## Setup (local)

Prerequisites: Node 22.12+/24, Docker.

```bash
cp .env.example .env              # set BETTER_AUTH_SECRET (openssl rand -base64 32) and SEED_USER_PASSWORD
docker compose up -d --wait       # Postgres 17 on localhost:5433 — databases tenantdesk + tenantdesk_test
npm ci                            # postinstall runs prisma generate
npx prisma migrate deploy         # schema + constraints
npm run db:seed                   # 2 tenants, 3 users, memberships, 1 project each (idempotent)
npm run dev                       # http://localhost:3000
```

The Playwright suite needs `npx playwright install chromium` once.

## Tests

Exact commands and results from the submitted tree (2026-10-19, local Docker Postgres):

```text
$ npm run lint                → exit 0
$ npm run typecheck           → exit 0   (next typegen && tsc --noEmit)
$ npm test                    → Test Files 3 passed (3) · Tests 14 passed (14)
$ npm run test:integration    → Test Files 1 passed (1) · Tests 26 passed (26)
$ npm run test:e2e            → 3 passed (10.3s)
```

- **`test:integration`: the authorization boundary.**
  - **What runs:** `tests/integration/projects-authz.test.ts` calls the **real exported route
    handlers**, using session cookies from a **real Better Auth sign-in**, against the **real
    `tenantdesk_test` Postgres**. It's reset and seeded before every run. Nothing is mocked.
  - **Cases:**
    - Unauthenticated access and a forged session cookie get 401.
    - Cross-tenant reads and writes get 404, in both directions and through both URL shapes.
    - Viewer writes get 403.
    - Seven kinds of invalid input get 400, a non-JSON body gets 415, and a duplicate name gets 409.
    - Successful create and rename each write exactly one correct audit row.
    - A same-name rename changes nothing and writes no audit row.
    - **Atomicity:** a temporary DB trigger makes the audit insert fail, and the test asserts the
      rename rolled back.
    - **DB constraints alone:** a cross-tenant audit row and a blank name are each refused even
      when the app is bypassed.
    - Sign-up is refused.
  - **Every denied write** asserts that no project changed and no audit row was added.
  - **Mutation-checked:** removing the role check, or the tenant filter on project lookups, makes
    the suite fail.
- **`test:e2e`** (Playwright against `next build && next start` on the test DB):
  - A signed-out user is redirected; a wrong password is rejected.
  - Ada creates a project (validation and duplicate-name states included), renames it, then gets
    "not found" for Globex in both the UI and the API.
  - Vic sees no write controls, and a forced POST returns 403.
- **`npm test`:** unit tests for the shared Zod schema and the role logic in `requireMembership`
  (repository mocked).
- **Deployed smoke:** `scripts/smoke-authz https://kd-challenge.vercel.app` (needs
  `SEED_USER_PASSWORD`). Output is in [Deployment](#deployment).

---

## How authorization works

**Application authorization is the boundary; the database enforces tenant consistency. RLS is
not used.** (Decision record: [`knowledge/decisions/tenancy-authorization.md`](knowledge/decisions/tenancy-authorization.md).)

1. **Identity is resolved on the server** on every request:
   `auth.api.getSession({ headers })` inside `requireSession`. No session → **401**.
2. **The tenant in the URL is a request, not authorization.** `requireMembership(user, slug,
   minRole)` in `src/server/tenancy/tenancy.service.ts` looks up the session user's membership in
   that tenant. If there's no membership, or no such tenant, the answer is **404**, with an
   identical body either way so tenant existence doesn't leak. A member whose role is too low
   gets **403**. The membership-derived `tenantId` is the only tenant id the repositories ever
   receive; a `tenantId` in a request body is rejected (strict schema → 400).
3. **Every query on tenant-owned rows filters by `tenantId`** (`where: { id, tenantId }`). A
   project id from another tenant under your own tenant's URL → 404.
4. **Write + audit are one transaction** (`db.$transaction`). If the audit insert fails, the
   project change rolls back (tested).
5. **Database constraints:**
   - The composite FK `AuditEntry(tenantId, projectId) → Project(tenantId, id)` makes a
     cross-tenant audit row impossible.
   - A unique index on `("tenantId", lower("name"))` makes names unique per tenant, ignoring case.
   - A `CHECK` requires 1–80 non-blank characters.
   - `Membership` has the primary key `(tenantId, userId)`.
   - Every tenant-owned index starts with `tenantId`.

   See `prisma/migrations/20261020045913_tenancy_projects_audit/migration.sql`.
6. **The UI** hides write controls for viewers as a convenience. The server is the control.
   Next's `proxy.ts` is not used for authorization.

**Why not RLS (yet):**
- **What it would take:** RLS with Prisma on pooled Neon connections needs a non-owner role,
  `FORCE ROW LEVEL SECURITY`, and `set_config('app.tenant_id', …, true)` inside every
  transaction, reads included.
- **Why I left it out:** a half-configured RLS setup is worse than none, because it reads as
  protection it doesn't give.
- **Where it stands:** the app-level choke point plus the DB constraints are tested against the
  real database. RLS is the first item under limitations.

## Architecture

```text
src/app/api/**/route.ts        thin handlers: requireSession → Zod (.strict) → one service call → DTO
src/server/tenancy/            requireSession / requireMembership (the choke point), membership repository
src/server/projects/           service (authz, transaction, conflicts) → repository (only Prisma access) → DTO mapper
src/server/audit/              audit repository (always called with the transaction client)
src/server/http.ts             one error shape {error:{code,message,fieldErrors?}}, JSON-only writes
src/server/auth.ts             Better Auth (Prisma adapter, sign-up disabled)
src/lib/schemas/project.ts     Zod schema shared by forms and handlers
src/components/projects/       list, create/rename form, tenant switcher (TanStack Query)
prisma/                        schema, migrations, seed
tests/integration/, e2e/       authorization matrix, browser tests
```

API: `GET /api/me/tenants`, `GET|POST /api/tenants/:slug/projects`,
`PATCH /api/tenants/:slug/projects/:projectId`. Errors: 400 `VALIDATION_ERROR`,
401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `NAME_TAKEN`,
415 `UNSUPPORTED_MEDIA_TYPE`, 500 `INTERNAL` (never a stack trace or SQL).

## Deployment

- **Hosting:** Vercel, with Neon Postgres added through Vercel's integration.
- **Build:** `scripts/vercel-build` runs `prisma migrate deploy`, then the idempotent seed (only
  when `SEED_USER_PASSWORD` is set), then `next build`.
- **Why the seed runs in the build:** the integration's variables are Sensitive, so they can't be
  pulled to a local shell to seed from there.
- **Access:** Deployment Protection is off, so the reviewer can reach the app.

_Deployed smoke output: see [Submitted commit](#submitted-commit) below._

## Limitations (honest)

- **No RLS.** Tenant isolation rests on the app's authorization choke point and the DB constraints
  above.
- **No invitations, sign-up, member or role management, password reset, or email.** `admin` has no
  powers beyond `editor`.
- **No audit-log UI and no pagination or search.** Audit rows exist in the DB only.
- **One Neon database** serves both Preview and Production, so every branch's migrations and seed
  land in it.
- **The seed resets the three seed users' passwords** to `SEED_USER_PASSWORD` on every deploy.
- **Rate limiting** is Better Auth's built-in sign-in limit only.
- **Pages are client-rendered:** they render a shell, then fetch from the API. The not-member view
  is an in-page "Organization not found", not an HTTP 404 document. The API does return 404.
- **Workflow shortcut:** the slice was built directly in one Claude Code session rather than
  through the repo's implementer/reviewer agent loop (see the AI log), and there's no
  `features/tenantdesk/feature.md`.
- **Minimal styling:** plain Tailwind, not the shadcn primitives the repo's conventions prefer.

## Submitted commit

- **Code / deployed commit:** `e669357e4fe42ab6bdceb807354aee3f054c01d1` — merge of
  [PR #1](https://github.com/AlejandroGomezE/kd-challenge/pull/1) into `main`. Vercel production
  deployment `kd-challenge-k4s157qpc` was built from exactly this SHA and serves
  https://kd-challenge.vercel.app.
- The build log for that deployment shows `prisma migrate deploy` (2 migrations, none pending —
  already applied by the preview build) and `Seeded 2 tenants, 3 users.`
- Any later commit on `main` changes documentation only (this section).

Smoke test against production, 2026-10-19 after the merge:

```text
$ scripts/smoke-authz https://kd-challenge.vercel.app
TenantDesk authorization smoke — https://kd-challenge.vercel.app
  PASS  no session: GET /api/tenants/acme/projects                 401
  PASS  no session: POST /api/tenants/acme/projects                401
  PASS  sign in Ada (Acme admin)                                   200
  PASS  sign in Vic (Acme viewer)                                  200
  PASS  Ada can't see any Globex project id                        
  PASS  Ada: GET Acme projects                                     200
  PASS  Ada: GET Globex projects                                   404
  PASS  Ada: POST into Globex                                      404
  PASS  Ada: client-supplied tenantId is rejected                  400
  PASS  Ada: invalid name                                          400
  PASS  Vic: GET Acme projects                                     200
  PASS  Vic: POST (viewer write)                                   403
  PASS  Vic: PATCH (viewer write)                                  403

All checks passed.
```

The same script passed 13/13 against the branch preview
(`kd-challenge-git-tenantdesk-…vercel.app`) before the merge.
