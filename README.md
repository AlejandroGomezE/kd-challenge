# Starter App

A full-stack starter project with authentication and nothing else: a NestJS + Prisma API over
SQLite and a Vite + React single-page app. Users can sign up, sign in, see who they are on a Home
page, and sign out. Everything else (the feature workflow in `.claude/`, the conventions in
`knowledge/`, the test setup on both sides, the Docker stack) is there so new features can be added
on top. The whole stack runs with one `docker compose up --build`.

This README covers **what is included and why**. **How to run it** lives in
[`Runbook.md`](Runbook.md), which is the only place setup is described.

## Start here

```bash
docker compose up --build        # then open http://localhost:8080
```

Sign in as **`demo@example.com` / `password1234`**. A fresh Docker volume is seeded with three demo
accounts on first start. For running without Docker (`scripts/be-local` + `scripts/fe-local`), the
first-time setup, tests and every endpoint, see the [Runbook](Runbook.md):
[Run with Docker](Runbook.md#run-with-docker),
[First-time setup](Runbook.md#first-time-setup-fresh-clone--new-machine),
[Environment variables](Runbook.md#environment-variables),
[Run all tests](Runbook.md#run-all-tests),
[Backend](Runbook.md#backend-backend), [Frontend](Runbook.md#frontend-frontend).

Before you start, check [Known setup gotchas](#known-setup-gotchas).

---

## 1. What's included

| Piece | Where |
|---|---|
| Sign-up, sign-in, sign-out, `GET /auth/me` (custom cookie sessions) | `backend/src/auth/` |
| Users: repository + service, username / display-name rules (no HTTP surface of its own) | `backend/src/modules/users/` |
| HTTP pipeline: helmet, CORS, validation, fail-closed response serialization, one error shape | `backend/src/app.setup.ts`, `backend/src/common/` |
| Zod-validated environment, SQLite through Prisma 7, demo seed | `backend/src/config/`, `backend/src/database/` |
| Sign-in, sign-up, sign-out and Home pages; route guards | `frontend/src/pages/`, `frontend/src/routes/` |
| Auth state (`useAuth()`), API client, Zod form schemas | `frontend/src/lib/` |
| The full shadcn/ui component library | `frontend/src/components/ui/` |
| Unit, e2e and browser E2E test setups | `backend/src/**/__tests__/`, `backend/test/`, `frontend/src/**/__tests__/`, `frontend/e2e/` |
| Docker stack (two production-like images) | `compose.yaml`, `backend/Dockerfile`, `frontend/Dockerfile` |
| Feature workflow for Claude Code | `.claude/`, `features/`, `knowledge/` |

The Home page is a single card with the signed-in user's display name, `@username`, email and a
Sign out link. It's the placeholder to replace with the first real feature.

---

## 2. Stack and why

**Backend: NestJS 12, Prisma 7, SQLite** (through `@prisma/adapter-better-sqlite3`).

- NestJS gives modules, dependency injection, a global guard, pipes, interceptors and filters out
  of the box. Those are where auth, validation, response whitelisting and error normalization live,
  so a feature module only holds its own logic.
- Prisma gives a typed client generated from one schema file (`backend/prisma/schema.prisma`), so a
  query can't drift from the model without a type error. Prisma 7 needs an explicit driver adapter,
  which is wired in `src/database/prisma.service.ts`.
- The schema is applied with `prisma db push`. There is no migrations folder, which is a
  prototype-stage choice.
- Validation uses `class-validator` DTOs, plus Zod for environment variables at boot.
  Passwords are hashed with `argon2`, `helmet` sets security headers, and `@nestjs/throttler`
  handles rate limits.

**Why SQLite.**

- **Zero setup.** There's no database server to install or run: clone, `npx prisma db push`, and it
  works.
- **Fast, isolated tests.** The e2e suite gets its own file database (`backend/prisma/e2e.db`) and
  never touches dev data. Running the tests needs no container.
- **A simpler Docker stack.** There's no separate database container; the database is a file on a
  named volume.

The cost is one writer at a time (see [limitations](#6-known-limitations)). **Moving to Postgres**
would be: datasource `provider = "postgresql"`, `@prisma/adapter-pg` instead of the better-sqlite3
adapter in `PrismaService`, `prisma7.config.ts` and the seed CLI (`src/database/seed/seed.ts`), a
Postgres service in `compose.yaml`, and migrations instead of `db push` for anything with real
data. The Prisma queries themselves are provider-neutral.

**Frontend: Vite 8, React 19, strict TypeScript, TanStack Query 5, Tailwind CSS 4, shadcn/ui,
react-router.**

- Vite for fast dev and a static bundle that nginx serves.
- TanStack Query owns server state, including the signed-in user (`GET /auth/me`) and a central 401
  handler in `src/app/query-client.ts`. That keeps components free of hand-rolled
  fetch/`useEffect` state.
- shadcn/ui components are copied into `src/components/ui/`, so they are owned code built on Radix
  accessibility primitives. The project's rule is to reuse one before writing a new component
  ([decision](knowledge/decisions/shadcn-component-preference.md)).
- Forms use `react-hook-form` + Zod, and the schemas mirror the backend rules.

**Tests: Vitest on both sides.** The frontend adds React Testing Library and MSW. MSW fakes the API
at the network layer, so tests go through the real `apiClient`. Playwright drives the real stack in
Chromium. See [Testing](#4-testing).

---

## 3. Authentication

Custom, with no third-party auth provider (`backend/src/auth/`).

- **Passwords.** argon2id (`memoryCost 19456`, `timeCost 2`, `parallelism 1`; `ARGON2_OPTIONS` in
  `users.service.ts`). Passwords are 12–128 characters at sign-up. The salt is inside the hash
  string.
- **Accounts.** Email (trimmed, lowercased, unique), username (trimmed, lowercased, 3–20 characters
  of `a-z0-9_`, not a reserved word, unique) and a required display name (1–50 characters counted
  as Unicode code points, no line breaks). The rules live in
  `backend/src/modules/users/username.rules.ts`; the frontend mirrors them in
  `frontend/src/lib/validation/`.
- **Sessions are server-side.** Sign-up and sign-in create a random 32-byte token (base64url). Only
  its **SHA-256** goes into `Session.tokenHash`, so a database leak doesn't hand out live sessions.
  Sessions last 7 days from creation; the expiry is fixed, not extended on use. Expired rows are
  deleted when they are looked up, and swept whenever a new session is created.
- **Cookie.** `sid`, `httpOnly`, `SameSite=Lax`, `path=/`, and `Secure` only when
  `NODE_ENV=production`. Docker defaults to `development` because some browsers (Safari) drop
  `Secure` cookies over plain `http://localhost`. The frontend never sees the token: `apiClient`
  sends `credentials: 'include'`.
- **Gated by default.** `AuthGuard` is registered globally (`APP_GUARD`). Every route needs a live
  session unless it is marked `@Public()`, and only sign-up, sign-in and sign-out are. Handlers read
  the user with `@CurrentUser()`. A new endpoint is protected without doing anything.
- **CSRF.** The same guard rejects POST, PUT, PATCH and DELETE whose `Origin` isn't exactly
  `FRONTEND_ORIGIN` with a 403. This applies to public routes too, which covers login CSRF. A
  missing `Origin` (non-browser clients) is allowed. `SameSite=Lax` and the exact-origin CORS
  allowlist add further protection.
- **No account enumeration on sign-in.** An unknown email and a wrong password both return the same
  401 `Invalid email or password`. For an unknown email the service still verifies against a dummy
  argon2 hash (computed at module init), so timing matches too. Sign-up does return 409 for a taken
  email or username; the rate limit mitigates that.
- **Rate limits** (`auth/throttlers.ts`). Sign-up and sign-in are limited to 5 per minute per IP,
  per route (the `auth` throttler). A second named throttler, `user`, keys on the session user's id
  for signed-in routes: none use it yet, and a new route opts in with `@UseGuards(ThrottlerGuard)`
  plus `@Throttle({ [USER_THROTTLER]: { limit, ttl: THROTTLE_TTL_MS } })` (default 10 per minute).
- **Responses fail closed.** Each handler declares `@SerializeOptions({ type: XResponseDto })`, and
  the global `ResponseSerializerInterceptor` emits only the `@Expose()`d fields. A body without a
  declared DTO is a 500 instead of an unfiltered object, so a Prisma row (with `passwordHash`) can't
  leak by accident. All errors go through one `AllExceptionsFilter` into
  `{ statusCode, message, timestamp, path }`.
- **Frontend guards.** `ProtectedRoute` wraps everything except `/sign-in`, `/sign-up` and
  `/sign-out`:
  - Signed-out visitors go to `/sign-in` and come back to the route they asked for (open redirects
    are rejected).
  - `PublicOnlyRoute` sends signed-in users away from the auth pages.
  - Only a 401 from `/auth/me` means "signed out". A 500 or a network error shows "Couldn't reach
    the server" with Retry.
  - A 401 on any other request resets the user and drops cached queries centrally.

**Why sessions and not JWT:**

- Sign-out deletes the session row, so revocation is real and immediate.
- Nothing readable by JavaScript is ever issued.
- There is no refresh-token scheme to get right.

The cost is one indexed lookup per request (`tokenHash` is unique), which is negligible here.

Depth: [backend architecture](knowledge/infra/backend-architecture.md),
[frontend architecture](knowledge/infra/frontend-architecture.md),
[code quality](knowledge/infra/code-quality.md),
[UI component inventory](knowledge/infra/ui-component-inventory.md).

---

## 4. Testing

| Layer | Where | What |
|---|---|---|
| Backend unit | `backend/src/**/__tests__/*.spec.ts` | Services, controllers, guard, DTOs, rules, interceptor, config, seed data. Dependencies are mocked with `Test.createTestingModule`, with no database. |
| Backend e2e | `backend/test/*.e2e-spec.ts` | The real app through `configureApp()` and supertest, against a dedicated `prisma/e2e.db` that is rebuilt from the schema on every run and deleted afterwards (the seed spec uses its own `prisma/e2e-seed.db`). It never touches `dev.db`. |
| Frontend | `frontend/src/**/__tests__/*.test.{ts,tsx}` | Vitest, jsdom and React Testing Library. The API is faked with MSW at the network layer, and an unhandled request fails the test. |
| Browser E2E | `frontend/e2e/*.spec.ts` | Playwright + Chromium against the real stack: the built backend and a Vite dev server on their own ports (3100 / 5174) and their own `prisma/playwright.db`, recreated each run. It never touches `dev.db`. |

- `backend/test/app.e2e-spec.ts` covers the auth flow end to end: sign-up setting the cookie and
  returning only the response DTO fields, duplicate email or username → 409, sign-in failing
  identically for an unknown email and a wrong password, `/auth/me` and sign-out managing the
  session lifecycle, an expired session → 401, a foreign `Origin` → 403 and the sign-in rate limit.
  `validation.e2e-spec.ts` pins strict request typing and `seed.e2e-spec.ts` the seed.
- `frontend/e2e/auth.spec.ts` signs up a fresh user in a real browser, lands on Home, signs out,
  gets sent back to sign-in from a gated URL, and signs in again. A second test checks that a wrong
  password shows "Invalid email or password".

How to run everything: [Runbook, Run all tests](Runbook.md#run-all-tests).

---

## 5. Repository layout

```
backend/     NestJS API: src/, prisma/schema.prisma, test/ (e2e), Dockerfile, docker-entrypoint.sh
frontend/    Vite + React SPA: src/, e2e/ (Playwright), Dockerfile, nginx.conf
compose.yaml the whole stack in Docker
scripts/     be-local, fe-local, down-be, down-fe, check-env (thin wrappers around npm scripts)
Runbook.md   how to set up, run and test everything
knowledge/   architecture and decision docs (infra/, decisions/)
features/    one feature.md per feature built through the workflow (empty to start)
.claude/     the Claude Code workflow: skills, agents, review contract
```

```
backend/src/
  auth/            sign-up/in/out, sessions, global AuthGuard, @Public(), @CurrentUser(), throttlers
  modules/users/   UsersRepository, UsersService, username / display-name rules, UserResponseDto
  common/          AllExceptionsFilter, ResponseSerializerInterceptor
  config/          configuration + Zod env validation
  database/        PrismaService (SQLite adapter), seed
  app.setup.ts     HTTP pipeline shared by main.ts and the e2e suite

frontend/src/
  app/             App, router, providers, query client (central 401 handling)
  routes/          ProtectedRoute, PublicOnlyRoute
  pages/           Home, SignIn, SignUp, SignOut
  components/      ui/ (shadcn), AuthLayout, BrandMark
  lib/api/         apiClient (fetch, credentials: 'include'), error messages, response types
  lib/auth/        AuthProvider, useAuth(), redirect target
  lib/validation/  Zod schemas mirroring the backend rules
  test/            MSW server + default handlers, renderWithProviders
```

---

## 6. Known limitations

- **Single instance only.** The rate-limit counters (`@nestjs/throttler`'s default storage) are
  per process, and SQLite allows one writer at a time. Fine for one container; it rules out
  horizontal scaling as built.
- **No migrations.** `prisma db push` only. A change that would lose data needs a reset (locally
  delete `backend/prisma/dev.db*` and push again; in Docker `docker compose down -v`).
- **Throttling by IP without `trust proxy`.** Behind a reverse proxy every client would share one
  sign-in/sign-up bucket.
- **Auth is minimal.** No password reset, no email verification, and no lockout beyond the rate
  limit. Sessions last 7 days from sign-in, with no "remember me" option and no list of active
  sessions. There is no endpoint to change a username, display name or password.

Also see [`.claude/ROADMAP.md`](.claude/ROADMAP.md).

### Known setup gotchas

The [Runbook](Runbook.md) is the source for the steps; these are the things most likely to trip a
fresh setup.

- **Node version.** Use Node ^22.12 (22 LTS, pinned in `.nvmrc`), 24 or 26+. Older versions fail:
  the frontend's Vitest and the backend's `better-sqlite3` require them. `engines` in both
  `package.json` files and `scripts/check-env` enforce the same range.
- **Native build.** `npm install` in `backend/` compiles `better-sqlite3` from source, so it needs a
  C/C++ toolchain (Xcode Command Line Tools on macOS, `build-essential` + `python3` on Linux).
- **Docker is the zero-setup path.** It needs no host Node, npm or Prisma step.
- **Browser E2E needs Chromium and free ports.** Run `npx playwright install chromium` once in
  `frontend/`, and keep ports 3100 and 5174 free: the suite starts its own servers there.

---

## 7. Adding a feature

The repo ships with a Claude Code workflow ([`.claude/WORKFLOW.md`](.claude/WORKFLOW.md)) of four
phases, one skill each:

| Phase | Skill | What happens |
|---|---|---|
| Frame | [`/feature`](.claude/skills/feature/SKILL.md) | Agree the slug and scope, then write `features/<slug>/feature.md` with the touched surface and acceptance criteria. |
| Build | [`/implement`](.claude/skills/implement/SKILL.md) | Split the plan into tasks and run them through an `implementer` → `reviewer` loop, up to 3 independent tasks in parallel, never two on overlapping files. |
| Verify | [`/review-feature`](.claude/skills/review-feature/SKILL.md) | Run the real app and check each acceptance criterion against it, then stop the servers. Anything wrong goes back to Build. |
| Close | [`/close-feature`](.claude/skills/close-feature/SKILL.md) | Write the tests the change needs, open the PR, run a [`/review-pr`](.claude/skills/review-pr/SKILL.md) pass, and merge only on an explicit go-ahead. |

- **Agents.** [`implementer`](.claude/agents/implementer.md) implements exactly one task or stops
  with `BLOCKED`. [`reviewer`](.claude/agents/reviewer.md) is read-only and approves or rejects
  against the task; a fresh reviewer is spawned for every review.
- **Review contract.** [`.claude/review-contract.md`](.claude/review-contract.md) is one rulebook:
  severities, "a finding names a file and line", and stack rules such as repository-only Prisma
  access, response DTOs on every endpoint, and no unrequested `@Public()`.
- **Shared context.** [`knowledge/`](knowledge/README.md) holds the architecture docs agents read
  before writing code. [`.claude/CONVENTIONS.md`](.claude/CONVENTIONS.md) covers commit format,
  when to stop and ask, and leaving no dev servers running.

Without the workflow, the short version is: a backend feature is a module under
`backend/src/modules/<name>/` (controller → service → repository, request and response DTOs in
`dto/`), imported by `app.module.ts`; a frontend feature is a page under `frontend/src/pages/`
registered in `src/app/router.tsx` inside `ProtectedRoute`, with its data through TanStack Query
and `apiClient`, and its response types in `src/lib/api/types.ts`.
