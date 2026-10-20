---
title: App architecture
type: infra
summary: TenantDesk is one Next.js App Router app at the repo root (strict TS, Node runtime) — route handlers as the API, a Route handler → Service → Repository → Prisma layering under src/server/, Better Auth sessions, TanStack Query on the client, and the test tiers. Target state from docs/build-spec.md; update to "active" once the code exists.
status: planned
last-verified: 2026-10-19
tags: [nextjs, react, architecture, prisma, better-auth, tanstack-query, tests]
---

## Shape

One Next.js app at the **repo root** — no `backend/` / `frontend/` split. Every route runs on the
**Node.js runtime** (never Edge: Prisma + `pg` need Node).

```text
prisma/
├── schema.prisma          # Better Auth tables + Tenant, Membership, Project, AuditEntry
├── migrations/            # committed; raw SQL for expression indexes / checks / RLS
└── seed.ts                # idempotent seed (docs/build-spec.md §4)
src/
├── app/
│   ├── api/auth/[...all]/route.ts                       # Better Auth handler (only)
│   ├── api/me/tenants/route.ts                          # GET
│   ├── api/tenants/[tenantSlug]/projects/route.ts       # GET, POST
│   ├── api/tenants/[tenantSlug]/projects/[projectId]/route.ts  # PATCH
│   ├── sign-in/page.tsx
│   ├── page.tsx                                         # tenant picker
│   └── t/[tenantSlug]/projects/page.tsx                 # the vertical slice
├── server/                # server-only code (`import 'server-only'`)
│   ├── auth.ts            # betterAuth({ database: prismaAdapter(prisma, …), emailAndPassword })
│   ├── db.ts              # the one PrismaClient (adapter-pg), globalThis-cached in dev
│   ├── http.ts            # AppError → Response mapper, json(), parseJson(schema)
│   ├── tenancy/           # membership.repository.ts, tenancy.service.ts (requireSession / requireMembership)
│   ├── projects/          # projects.repository.ts, projects.service.ts, project.dto.ts
│   └── audit/             # audit.repository.ts
├── lib/
│   ├── api-client.ts      # fetch wrapper → ApiError; the only place the client calls fetch
│   ├── auth-client.ts     # Better Auth React client
│   ├── query-keys.ts
│   └── schemas/           # Zod schemas shared by client forms and route handlers
└── components/
    ├── ui/                # shadcn primitives — see [[UI component inventory]]
    └── projects/          # ProjectList, CreateProjectForm, RenameProjectForm, …
tests/
├── integration/           # Vitest, real Postgres, real route handlers, real Better Auth
└── unit/                  # or __tests__/ next to the code — see below
e2e/                       # Playwright
```

## Layering (server)

The same pragmatic layering as [[Code quality]], with a route handler in place of a controller:

```text
Route handler (src/app/api/**/route.ts)   — thin: requireSession, parse+validate (Zod), call one service method, map to DTO/Response
   ↓
Service (src/server/<area>/<area>.service.ts)   — authorization (requireMembership + role), business rules, transactions
   ↓
Repository (src/server/<area>/<area>.repository.ts) — the ONLY layer importing `db`; every tenant-owned query takes tenantId
   ↓
Prisma → Postgres
```

- **Repositories** are plain modules of functions (or one object) — no classes with DI, no
  interfaces. They accept an optional `tx: Prisma.TransactionClient` so a service can compose a
  write + audit in one `db.$transaction`.
- **Services** throw `AppError` subclasses (`Unauthenticated`, `Forbidden`, `NotFound`,
  `ValidationError`, `Conflict`); `http.ts` maps them to the error shape in the spec. A Prisma
  `P2002` on the project name index becomes `Conflict('NAME_TAKEN')` in the service.
- **DTOs** are explicit mappers (`toProjectDto(row)`) — a raw Prisma row never leaves a handler.
- **Server components** that need data call the **service** directly (same authorization path);
  they never import a repository or `db`.

## Auth (Better Auth)

- Config in `src/server/auth.ts`; handler mounted at `/api/auth/[...all]` via `toNextJsHandler`.
- Email + password, `disableSignUp: true` (users come from the seed only).
- Sessions are rows in Postgres; the cookie is HttpOnly / SameSite=Lax / Secure in production.
- Server: `auth.api.getSession({ headers })` → `requireSession` in `tenancy.service.ts`. Nothing
  else reads cookies.
- Middleware (if any) only redirects signed-out page visits — it is not an authorization layer.

## API conventions

- Paths are tenant-scoped by slug: `/api/tenants/[tenantSlug]/…`. In Next 15+ `params` is a
  `Promise` — `const { tenantSlug } = await params`.
- Request bodies are parsed with a `.strict()` Zod schema; malformed JSON and unknown keys → 400.
- Writes require `Content-Type: application/json` (else 415).
- Errors: `{ error: { code, message, fieldErrors? } }`; status policy in
  [[Tenancy and authorization]].

## Client

- TanStack Query for server state (`useQuery` list, `useMutation` create/rename with
  invalidation of `['tenants', slug, 'projects']`). No `useEffect` + `useState` fetch pairs.
- All HTTP goes through `src/lib/api-client.ts` (throws `ApiError { status, code, message,
  fieldErrors }`).
- Forms: React Hook Form + `zodResolver` with the shared schema from `src/lib/schemas/`.
- Required states for every data view: pending, empty, validation, failure (+ retry). Role-based
  hiding of controls is UX only — the server is the control.

## Tests

| Tier | Tool | Where | What |
|---|---|---|---|
| Unit | Vitest | `__tests__/` next to the code | Zod schemas, role logic with a mocked repository, error mapper, components (RTL + MSW) |
| Integration | Vitest | `tests/integration/` | Real exported route handlers + real Better Auth sign-in cookie + real Postgres (`tenantdesk_test`, reset + seeded in global setup, serial). The authorization matrix lives here. |
| E2E | Playwright | `e2e/` | `next build && next start` against the test DB: sign-in, create/rename, cross-tenant 404, viewer 403 |
| Preview smoke | bash + curl | `scripts/smoke-authz` | Same attacks against the deployed URL |

Integration tests never mock auth or the database — that's the point of them. Unit tests never
touch a real database.

Scripts (`package.json`): `dev`, `build`, `start`, `lint`, `typecheck`, `test` (unit),
`test:integration`, `test:e2e`, `db:migrate`, `db:seed`.

## Open questions

- Unit tests under `__tests__/` next to code vs a top-level `tests/unit/` — decide when the first
  one is written and update this doc.
