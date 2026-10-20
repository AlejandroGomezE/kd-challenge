---
title: Backend architecture
type: infra
summary: Layered NestJS backend (backend/) — current implementation state (Prisma 7 over SQLite, Zod-validated config, global exception filter, fail-closed response serialization, email+password auth with cookie sessions, a users module with no HTTP surface, named throttlers, demo seed) and the conventions a new module follows.
status: active
last-verified: 2026-10-19
tags: [backend, nestjs, architecture, prisma, config, auth, throttling, seed, tests]
---

## Layered architecture

Traditional layered architecture, kept deliberately simple — see [[Code quality]] for
what to avoid (no hexagonal/clean architecture, no CQRS, no ports-and-adapters, no
injection token per repository):

```text
Controller
   ↓
Service
   ↓
Repository
   ↓
Prisma / SQLite
```

Not every module needs every layer — one with no persistence has no repository, one
with no business rules barely needs a service. Add layers because a module needs them,
not by default.

- **Controller** — binds and validates the request (DTOs), calls one service method, shapes the
  response (response DTO). No business logic.
- **Service** — business rules; calls repositories. Never injects `PrismaService`.
- **Repository** (`<name>.repository.ts`) — the **only** layer that injects `PrismaService`. A
  plain `@Injectable()` class: no interface, no injection token, no business rules. It may return
  full Prisma records; the service decides what leaves it.

## Current structure (`backend/src/`)

```text
backend/src/
├── main.ts                # bootstrap: NestFactory.create → configureApp(app) → listen
├── app.setup.ts           # configureApp(app): helmet, cookie-parser, CORS, ValidationPipe,
│                          #   ResponseSerializerInterceptor, exception filter — shared by
│                          #   main.ts and the e2e suite
├── app.module.ts          # root module — Config, Prisma, Auth, Users, (conditionally) Observe
├── observe.ts             # NestJS Observe APM module/instrument factory
├── config/
│   ├── configuration.ts           # typed config (nodeEnv, port, database.url, frontendOrigin)
│   └── environment.validation.ts  # Zod schema, validated at boot via ConfigModule
├── database/
│   ├── prisma.module.ts   # @Global, exports PrismaService
│   ├── prisma.service.ts  # extends generated PrismaClient, better-sqlite3 driver adapter;
│   │                      #   exports resolveDatabaseUrl (also used by the seed CLI)
│   └── seed/              # demo accounts (`npm run db:seed`) — see Database → Seed data
├── common/
│   ├── filters/
│   │   └── all-exceptions.filter.ts  # global, normalizes every error response
│   └── interceptors/
│       └── response-serializer.interceptor.ts  # global fail-closed response whitelist
├── auth/
│   ├── auth.module.ts             # imports UsersModule + ThrottlerModule (global, THROTTLERS);
│   │                              #   APP_GUARD = AuthGuard; exports AuthService
│   ├── throttlers.ts              # the named throttlers: `auth` (per IP) and `user` (per session
│   │                              #   user); USER_THROTTLER, THROTTLE_TTL_MS
│   ├── auth.controller.ts         # POST /auth/sign-up, /sign-in, /sign-out; GET /auth/me
│   ├── auth.service.ts            # credential check, session create/validate/revoke
│   ├── auth.guard.ts              # global guard: Origin check → @Public() → session
│   ├── sessions.repository.ts     # Prisma access for Session (token hashes only)
│   ├── public.decorator.ts        # @Public() — opts a handler/controller out of the session check
│   ├── current-user.decorator.ts  # @CurrentUser() — the user AuthGuard put on the request
│   ├── authenticated-user.interface.ts
│   ├── session-cookie.ts          # set / clear / read the `sid` cookie
│   ├── session.constants.ts       # cookie name, 7-day TTL
│   └── dto/                       # request DTOs: SignUpDto, SignInDto (class-validator)
├── modules/
│   └── users/
│       ├── dto/
│       │   └── user-response.dto.ts  # UserResponseDto { id, email, username, displayName }
│       ├── username.rules.ts      # authoritative username / display-name rules:
│       │                          #   RESERVED_USERNAMES, length limits, normalizers,
│       │                          #   @IsUsername() / @IsDisplayName() DTO decorators
│       ├── users.module.ts        # providers only (no controller); exports UsersService
│       ├── users.service.ts       # create (argon2id hash, 409 on duplicate), findByEmail,
│       │                          #   findById, toPublicUser; ARGON2_OPTIONS, normalizeEmail
│       └── users.repository.ts    # Prisma access for User
└── generated/prisma/      # `npx prisma generate` output — gitignored, never hand-edited
```

Module graph: `AuthModule → UsersModule`; nothing else. `UsersModule` has no controller — the
only HTTP surface is `AuthController`, which uses `UsersService`. The auth guard and decorators
live in `auth/`, next to the module that owns them, not in `common/`.

### Adding a module

A new domain module goes under `modules/<name>/` in the shape [[Code quality]] spells out
(`dto/`, controller, service, repository, module), is imported by `app.module.ts`, and gets:

- request DTOs with `class-validator` decorators on every field;
- a response DTO per returned shape, declared on each handler (see Responses);
- nothing extra for auth — its routes are gated by the global guard; read the user with
  `@CurrentUser()` and scope user-owned queries by that id (never by an id in the request);
- a `@UseGuards(ThrottlerGuard)` + `@Throttle({ [USER_THROTTLER]: … })` on writes worth limiting;
- unit specs in `__tests__/` and, for endpoints, an e2e spec in `backend/test/`.

Don't scaffold empty folders ahead of time; add a `common/` subfolder only when something
cross-cutting actually needs it (see [[Code quality]] for the taxonomy).

## Database

Prisma 7 (`backend/prisma/schema.prisma`, config in `backend/prisma7.config.ts` — loads
`DATABASE_URL` via `dotenv/config`). Models:

- `User` — `id` cuid, `email` unique, `username` unique, `displayName` optional, `passwordHash`,
  `createdAt`, `updatedAt`. Emails and usernames are stored lowercase by the app, so the plain
  unique indexes give case-insensitive uniqueness on SQLite without a custom collation.
  `displayName` is required by the sign-up DTO, not by the schema — it's nullable only for
  accounts created before it existed.
- `Session` — `id`, `tokenHash` unique, `userId` → `User` with `onDelete: Cascade`, `expiresAt`,
  `createdAt`; indexed on `userId`.

The schema is applied with `npx prisma db push` — there is no migrations folder. After a schema
change run `npx prisma db push` and `npx prisma generate` from `backend/`. A change that would
lose data isn't forced: reset the dev DB (delete `backend/prisma/dev.db*`, push again) instead.

The database is **SQLite** — a local file, no server. Prisma 7 requires an explicit
**driver adapter** (the bundled query-engine binary is gone), so `PrismaService`
constructs `new PrismaBetterSqlite3({ url })` (`@prisma/adapter-better-sqlite3` +
`better-sqlite3`) and passes it to the `PrismaClient` superclass constructor.

`DATABASE_URL` is a `file:` URL (default `file:./dev.db`). A relative path is anchored
to `backend/prisma/` from the module's own location, not `process.cwd()` — both in
`PrismaService` and in `prisma7.config.ts` — so the CLI and the running app always open
the same file, `backend/prisma/dev.db` (git-ignored). Absolute paths and `:memory:`
pass through unchanged. `PrismaService` skips an eager `$connect()`, so the app boots even
before the file exists.

**Prisma error codes worth knowing.** Rely on unique indexes instead of find-then-create (which
races): catch P2002 and map it to a 409. With Prisma 7 + the better-sqlite3 adapter there is
**no `meta.target`** on a P2002 — the fields are under
`meta.driverAdapterError.cause.constraint.fields`; `UsersService` reads both (and falls back to
checking whether the email exists) to tell a taken email from a taken username.

### Seed data

`src/database/seed/` holds the demo accounts (`npm run db:seed`, `npx prisma db seed`; usage and
credentials in the Runbook, Backend → Seed data). It lives under `src/` so `nest build` compiles it
to `dist/database/seed/` and it runs as plain `node` — no tsx/ts-node, and the Docker runtime image
(which ships `dist/` only) runs it as-is. It isn't a Nest module and nothing in the app imports it.
Split in three layers:

- **Pure data** — `seed-data.ts`: `buildSeedData()` returns three users (`demo`, `alice`, `bob`,
  `<username>@example.com`, a display name each) and `SEED_PASSWORD` (`password1234`).
  `validateSeedData()` checks them against `username.rules.ts` (imported, not copied), so the seed
  can never write an account sign-up would reject. No I/O.
- **Writer** — `run-seed.ts`: `runSeed(prisma, { ifEmpty })` validates, hashes the shared
  password once with sign-up's `ARGON2_OPTIONS`, and in one interactive transaction deletes every
  Session and User, then `createMany`s the users. With `ifEmpty` it returns `skipped` when any user
  exists. Takes a `PrismaClient`, so a spec can pass any client. A new model holding user data
  must be added to the wipe (children before parents) and, if it should be seeded, to the data
  set.
- **CLI** — `seed.ts` (compiled `dist/database/seed/seed.js`): parses `--if-empty` (any other
  argument → usage error), loads `dotenv/config`, builds a `PrismaClient` with the better-sqlite3
  adapter and `resolveDatabaseUrl(process.env.DATABASE_URL)` from `prisma.service.ts` (so it opens
  the same file as the app), logs the count, exits non-zero on failure. This is the one place
  outside `PrismaService` that constructs a `PrismaClient` — it runs outside Nest.

Wiring: `db:seed` in `package.json` (`nest build && node dist/database/seed/seed.js`),
`migrations.seed` in `prisma7.config.ts` (`npm run db:seed --`), and `docker-entrypoint.sh` runs
`node dist/database/seed/seed.js --if-empty` after `prisma db push` unless `SEED_ON_START=false`
(`compose.yaml`, default `true`).

## Config

`@nestjs/config`, loaded globally in `app.module.ts`:
`ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate })`.
`environment.validation.ts` is a Zod schema — `NODE_ENV` (`development` | `production`
| `test`, default `development`), `PORT` (optional, default 3000), `DATABASE_URL`
(required), `FRONTEND_ORIGIN` (default `http://localhost:5173`; must be an exact origin
— no path or trailing slash — because CORS and the guard compare it verbatim with the
`Origin` header), `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` (optional). An invalid or
missing required var throws at boot instead of failing later, deeper in the app. A new env
var goes in both the schema and `configuration.ts`, and in `backend/.env.example`.

Besides the local run (`scripts/be-local`, env from `backend/.env`), the backend also runs in
Docker via the root `compose.yaml` (`docker compose up --build`). There, compose supplies the env:
`DATABASE_URL=file:/data/app.db` on a named volume, `FRONTEND_ORIGIN=http://localhost:8080` and
`NODE_ENV=development`. The entrypoint runs `prisma db push` before `node dist/main`. See Runbook →
Run with Docker.

`ObserveModule.forRoot(...)` is wired directly off `process.env` in `app.module.ts` rather than
through `ConfigService` — dynamic module options are resolved at class-definition time, before
Nest's DI container exists. `dotenv/config` (imported first in `main.ts`) guarantees `.env` is
loaded before `AppModule` evaluates.

## Cross-cutting concerns

All HTTP-level setup lives in `configureApp(app)` (`src/app.setup.ts`), called by
`main.ts` and by the e2e specs, so e2e tests exercise the same pipeline as the
running server.

**Auth.** Email + password with server-side sessions (`src/auth/`, `src/modules/users/`).

- **Endpoints.** `POST /auth/sign-up` `{ email, username, displayName, password }` (201 +
  cookie, `UserResponseDto`; 409 `Email is already registered` / `Username is already taken`;
  400 on invalid input), `POST /auth/sign-in` (200 + cookie, `UserResponseDto`; 401
  `Invalid email or password`), `POST /auth/sign-out` (204; public and idempotent — revokes the
  session if any, always clears the cookie), `GET /auth/me` (`UserResponseDto` or 401).
  `UserResponseDto` = `{ id, email, username, displayName }`; `displayName` is `null` for accounts
  created before display names existed.
- **Global guard.** `AuthGuard` is registered as `APP_GUARD` in `AuthModule`, so every
  route requires a session by default. Order in `canActivate`: (1) **Origin check** —
  `POST/PUT/PATCH/DELETE` with an `Origin` other than `FRONTEND_ORIGIN` → 403, on
  `@Public()` routes too (login CSRF); a missing `Origin` is allowed, since non-browser
  clients carry no ambient cookie; (2) **`@Public()`** → allowed; (3) **session** — the
  `sid` cookie must resolve to a live session, else 401. The resolved user is set on
  `request.user` and read with `@CurrentUser()`. Never add per-controller auth guards.
- **Sessions.** Opaque token of 32 random bytes (`crypto.randomBytes`, base64url); only
  its SHA-256 hash is stored (`Session.tokenHash`). 7-day **absolute** expiry (not
  sliding), enforced server-side — an expired row is rejected and deleted, and expired
  rows are swept whenever a new session is created. A fresh session on every
  sign-up/sign-in; sign-out deletes it. Cookie `sid`: `HttpOnly`, `SameSite=Lax`,
  `Path=/`, `Expires` = session expiry, `Secure` when `NODE_ENV=production`.
  `cookie-parser` runs without a secret — the token is checked against the stored hash,
  so signing adds nothing.
- **Passwords.** argon2id (`argon2` package): `memoryCost: 19456` (19 MiB),
  `timeCost: 2`, `parallelism: 1` (`ARGON2_OPTIONS` in `users.service.ts`); the salt is
  per-hash and encoded in the hash string. DTO policy: password 12–128 chars on sign-up,
  1–128 on sign-in; email trimmed + lowercased, `@IsEmail`, max 254, unique (the unique
  index's P2002 → 409, no find-then-create race).
- **No enumeration on sign-in.** Unknown email and wrong password both return the same
  `401 Invalid email or password`; an unknown email still runs `argon2.verify` against a
  dummy hash precomputed at startup (`onModuleInit`) so timing matches. (Sign-up's 409 does
  reveal a registered email — accepted trade-off, mitigated by the rate limit.)
- **Throttling** (`auth/throttlers.ts`). `@nestjs/throttler`: one global
  `ThrottlerModule.forRoot` in `AuthModule` with the named throttlers; `ThrottlerGuard` is applied
  per handler (`@UseGuards`), never globally → 429 `Too many requests, please try again later`.
  `ThrottlerGuard` evaluates **every** configured throttler on each guarded route, so each named
  throttler selects itself with `skipIf`:
  - `auth` — 5 / 60 s, keyed by client IP (the default tracker); skipped when `req.user` is set.
    It exists for the `@Public()` sign-in / sign-up routes, where `AuthGuard` never sets
    `req.user`, so a signed-in caller can't use their session to dodge the sign-in limit.
  - `user` — keyed `user:<id>` (the session user), so users behind one IP don't share a budget
    and switching IPs doesn't reset it; skipped without a session user (its tracker throws 401
    rather than put anonymous requests in one "undefined" bucket). Default 10 / 60 s; a route
    sets its own with `@Throttle({ [USER_THROTTLER]: { limit, ttl: THROTTLE_TTL_MS } })`. No route
    uses it yet.

  Counters are per route (the storage key includes controller + handler). A request rejected by
  validation (400) still counts.

**User rules** (`username.rules.ts`, authoritative; the frontend mirror
`frontend/src/lib/validation/user-schemas.ts` must match, `RESERVED_USERNAMES` included).
Username: trimmed + lowercased, 3–20 chars of `[a-z0-9_]`, not reserved (`me`, `settings`,
`sign-in`, `sign-up`, `sign-out`, `auth`, `users`, `u`, `api`, `admin`, `root`). Display name:
trimmed, then 1–50 **code points** (`displayNameLength` = `Array.from(value).length` —
class-validator's `@Length` counts UTF-16 units, so it isn't used), no `\r` / `\n`; not unique,
case kept.

- **Validation decorators.** `@IsUsername()` and `@IsDisplayName()` bundle, via
  `applyDecorators`, a normalizing `@Transform` plus the `class-validator` checks. The transform
  runs in `plainToInstance`, before validation, so rules are checked against the value that will
  be stored. Add `@IsOptional()` next to `@IsUsername()` where the field may be omitted; for an
  omittable display name use `@ValidateIf((o) => o.displayName !== undefined)` rather than
  `@IsOptional()`, so an explicit `null` is still rejected. This is the pattern for any new
  field rule shared by several DTOs.

**Error handling.** A single global `AllExceptionsFilter`
(`src/common/filters/all-exceptions.filter.ts`) catches everything and normalizes the
response to `{ statusCode, message, timestamp, path }`. Throw Nest's HTTP exceptions from
services. Paired with a global `ValidationPipe` (`whitelist: true, transform: true`, **no**
implicit conversion) — values keep the JSON type the client sent, so a number or boolean in a
string field fails `@IsString()` with a 400 instead of being coerced
(`test/validation.e2e-spec.ts`). A field that genuinely needs conversion — numeric query params
always arrive as strings — declares it explicitly with `@Type(() => Number)`.

**Responses.** Request DTOs validate input (`class-validator`); response DTOs define
output. Every handler that returns a body returns a response DTO — a class with
`@Expose()` on each emitted field and nothing else exposed (e.g.
`UserResponseDto`) — declared with `@SerializeOptions({ type: XResponseDto })` plus
the matching concrete return type. The global `ResponseSerializerInterceptor`
(`src/common/interceptors/`, a `ClassSerializerInterceptor` subclass with
`excludeExtraneousValues: true`, registered in `configureApp`) converts the returned
value to that class and emits only exposed fields, so even a full Prisma row with
`passwordHash` can't leak. It fails closed: a body without a declared `type` (even a
DTO instance) is a 500, never passed through unfiltered. Never return Prisma models or
internal service types (`PublicUser`, `AuthenticatedUser`) directly. 204 endpoints
(`POST /auth/sign-out`) return `void` and need no DTO. **A nested object or array in a
response DTO needs `@Type(() => NestedDto)`** — without it `excludeExtraneousValues` copies the
nested value as an untyped plain object, bypassing the inner `@Expose()` whitelist.

**CORS.** `app.enableCors({ origin: [FRONTEND_ORIGIN], credentials: true })` — an
exact-match allowlist of one origin (never `*`); any other origin gets no
`Access-Control-Allow-Origin`. Required for the Vite frontend (`:5173`) to call the API
(`:3000`) with the session cookie.

**Security headers.** `helmet()` defaults.

**Observability.** [NestJS Observe](https://observe.nestjs.com) APM, optional — only
initializes when both `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` are set to a
non-empty value; see the Config section above.

## Tests

Unit specs (`*.spec.ts`, Vitest) live in a `__tests__/` folder next to the code they cover —
`src/auth/__tests__/auth.service.spec.ts`, `src/modules/users/dto/__tests__/…` — never loose
beside the source file, so a module's folder lists only its code. They import the code under test
with `../`. Service specs mock the repository through `Test.createTestingModule`; no real database
in a unit spec. `tsconfig.build.json` excludes `**/*spec.ts`, so nothing under `__tests__/` reaches
`dist/`.

E2e (`backend/test/*.e2e-spec.ts`, `npm run test:e2e`) boots the real `AppModule` through
`configureApp` against a dedicated SQLite file, `prisma/e2e.db` (git-ignored), never the dev DB:
`vitest.config.e2e.ts` sets `DATABASE_URL` (from `test/e2e-database.ts`) — it wins over `.env`,
since dotenv/`@nestjs/config` don't override an already-set variable — and `test/global-setup.ts`
deletes the file and recreates it with a plain `prisma db push` before each run, then deletes it
afterwards. A guard test asserts the connected file is `e2e.db`.

- `test/app.e2e-spec.ts` — the auth endpoints end to end: exact response keys, duplicate email /
  username, display-name rules, identical failures for unknown email and wrong password, the
  session lifecycle, expired sessions, foreign `Origin` → 403, the sign-in rate limit, and that
  `GET /auth/me` emits only `UserResponseDto` fields. It builds a fresh app per test (throttle
  counters never carry over) and deletes the users it created (sessions cascade).
- `test/validation.e2e-spec.ts` — strict request typing (no implicit conversion).
- `test/seed.e2e-spec.ts` — `runSeed` on its own file, `prisma/e2e-seed.db`, because it wipes
  every user and the other e2e files share `e2e.db` in parallel.

A new endpoint gets its own `test/<name>.e2e-spec.ts` in the same shape: fresh app per test via
`configureApp`, users created through `UsersService` / `AuthService` or the sign-up endpoint,
cleanup of what it created.

## Open questions

- `oxlint.json` turns `@typescript-eslint/no-explicit-any` **off**, while
  [[Code quality]] says to avoid `any`. Not reconciled — flagging so it isn't
  silently re-decided; revisit if `any` actually starts showing up in reviews.
- Throttling keys on the client IP as Express sees it; there's no `trust proxy` setting,
  so behind a reverse proxy every client would share one bucket. Revisit when deployed.
