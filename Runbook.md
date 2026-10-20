# RUNBOOK — running the Starter App

How to set up, run and test the app, from a fresh clone. The technical decisions (stack,
[auth](README.md#3-authentication), [limitations](README.md#6-known-limitations)) are in the root
[README.md](README.md).

**Quickest paths:**

- **Docker only:** `docker compose up --build` from the repo root, then open http://localhost:8080
  (see [Run with Docker](#run-with-docker)).
- **Local dev:** follow [First-time setup](#first-time-setup-fresh-clone--new-machine) below, then
  open http://localhost:5173.
- Either way, sign in as **`demo@example.com` / `password1234`** (seeded demo account), or create
  an account at `/sign-up`.

The repo is two independent npm projects, `backend/` and `frontend/`, each with its own
`package.json` and `node_modules`. The scripts under `scripts/` are thin wrappers that `cd` into
one of them and run its npm scripts. Commands below are run from the repo root unless they `cd`
first (the scripts resolve their own paths, so `scripts/<name>` works from any directory).

---

## First-time setup (fresh clone / new machine)

The database is a local SQLite file (`backend/prisma/dev.db`), and both the file and the generated
Prisma client (`backend/src/generated/prisma`) are git-ignored. On a fresh clone neither exists yet,
and `npm install` doesn't create them because there's no `postinstall` hook.

**Prerequisites:**

- **Node ^22.12 (22 LTS), 24 or 26+**, with the npm it ships (10 or 11). `.nvmrc` pins 22, so with
  nvm: `nvm install && nvm use`. Odd majors (23, 25) and anything older than 22.12 aren't
  supported: the frontend's Vitest and the backend's `better-sqlite3` require it, and it's what
  `engines` in both `package.json` files and `scripts/check-env` enforce.
- **git**, and **bash** for `scripts/` (on Windows: Git Bash or WSL, see [Cross-platform](#cross-platform)).
- **A C/C++ build toolchain** for the native `better-sqlite3` build during `npm install`: Xcode
  Command Line Tools on macOS (`xcode-select --install`), `build-essential` + `python3` on Debian/Ubuntu.
- **Chromium for Playwright** (only for the browser E2E suite): installed once with
  `npx playwright install chromium` from `frontend/`, included in the commands below.
- **Docker** (optional, only for [Run with Docker](#run-with-docker)): Docker Engine with the Compose v2
  plugin (`docker compose`). Verified with Docker 28.

Then run these once, in order:

```bash
git clone https://github.com/AlejandroGomezE/twitter-challenge.git
cd twitter-challenge
nvm install && nvm use            # only with nvm: installs and selects the Node pinned in .nvmrc
scripts/check-env                 # Node ^22.12 / 24 / 26+, npm; it will flag the missing node_modules/.env

# Backend
cd backend
npm install                       # also builds the native better-sqlite3 / argon2 modules
cp .env.example .env              # the defaults work as-is; see Environment variables
npx prisma generate               # writes the client to src/generated/prisma
npx prisma db push                # creates prisma/dev.db with every table in the current schema
npm run db:seed                   # loads the demo accounts (demo, alice, bob)
cd ..

# Frontend
cd frontend
npm install
cp .env.example .env              # optional: VITE_API_URL already defaults to http://localhost:3000
npx playwright install chromium   # one-time browser download, only for the browser E2E suite
cd ..

scripts/check-env                 # should now report everything OK
```

Then start the app in development mode, each in its own terminal, from the repo root:

```bash
scripts/be-local                  # backend on http://localhost:3000 (watch mode)
scripts/fe-local                  # frontend on http://localhost:5173
```

Open http://localhost:5173 and sign in as `demo@example.com` / `password1234`. To run the tests,
see [Run all tests](#run-all-tests).

- No database server is needed (no Postgres). Docker is optional; see
  [Run with Docker](#run-with-docker). The Prisma CLI picks up
  `prisma7.config.ts` on its own, so you don't need a `--config` flag.
- This schema has no migrations folder. `db push` syncs the schema into the database directly.
- `npm run db:seed` creates three demo accounts; sign in as `demo@example.com` /
  `password1234` (the others are in Backend → Seed data). Skip it to start with an empty DB and
  create an account through `/sign-up` in the frontend.
- To check it worked, run `npx prisma studio` from `backend/`. It opens a browser UI that lists the tables.
- **To start over** (wipe the dev DB, e.g. after a schema change that `db push` can't apply to
  existing rows): stop the backend, delete `backend/prisma/dev.db*` and run `npx prisma db push`
  again from `backend/` (plus `npx prisma generate` if the client is stale). The DB is empty
  afterwards; run `npm run db:seed` again for the demo accounts. To go back to just the demo
  accounts without touching the schema, `npm run db:seed` alone is enough — it resets the data itself.
- The test suites don't need `dev.db`: the backend e2e suite builds its own `prisma/e2e.db` and the
  browser E2E suite its own `prisma/playwright.db` on every run.

---

## Quick reference

| I want to… | Command (from repo root) |
|---|---|
| Set up a fresh clone (deps, `.env`, Prisma DB) | see [First-time setup](#first-time-setup-fresh-clone--new-machine) |
| Check the whole environment | `scripts/check-env` |
| Run the **backend** locally (`:3000`) | `scripts/be-local` |
| Run the **frontend** locally (`:5173`) | `scripts/fe-local` |
| Stop the **backend** (incl. orphaned watchers) | `scripts/down-be` |
| Stop the **frontend** | `scripts/down-fe` |
| Run the **whole stack in Docker** (`:8080` + `:3000`) | `docker compose up --build` — see [Run with Docker](#run-with-docker) |
| Load the **demo accounts** (**wipes** the dev DB first) | `cd backend && npm run db:seed` — see Backend → Seed data |
| Run the **full test suite** (unit, backend e2e, browser E2E) | see [Run all tests](#run-all-tests) |
| Run the **browser E2E** suite (Playwright) | `cd frontend && npm run test:e2e` |
| See every **environment variable** | see [Environment variables](#environment-variables) |

---

## Environment variables

Local runs read `backend/.env` and `frontend/.env`, created from their `.env.example` files in
[First-time setup](#first-time-setup-fresh-clone--new-machine). The backend validates its variables
at boot (`backend/src/config/environment.validation.ts`) and refuses to start on a bad value.
Docker reads the same names from the host environment instead (see [Run with Docker](#run-with-docker)).

| Variable | App | Required | Default | Example | Description |
|---|---|---|---|---|---|
| `DATABASE_URL` | backend | **yes** | none | `file:./dev.db` | SQLite file URL, resolved relative to `backend/prisma/`, so the example is `backend/prisma/dev.db`. |
| `PORT` | backend | no | `3000` | `3000` | Port the API listens on. Leave it set or remove the line: an empty `PORT=` fails validation. |
| `NODE_ENV` | backend | no | `development` | `development` | `development`, `production` or `test`. `production` makes the session cookie `Secure` (HTTPS only). |
| `FRONTEND_ORIGIN` | backend | no | `http://localhost:5173` | `http://localhost:5173` | Exact origin the frontend is served from (no path, no trailing slash). The only origin CORS allows and the auth guard's Origin check accepts. |
| `OBSERVE_APP_KEY` | backend | no | unset | `obs_key_…` | [NestJS Observe](https://observe.nestjs.com) APM key. APM turns on only when both Observe variables are set. |
| `OBSERVE_APP_SECRET` | backend | no | unset | `obs_secret_…` | NestJS Observe APM secret, paired with `OBSERVE_APP_KEY`. |
| `VITE_API_URL` | frontend | no | `http://localhost:3000` | `http://localhost:3000` | Base URL of the backend API. Baked into the bundle at build time. |
| `SEED_ON_START` | Docker only | no | `true` | `false` | `false` boots the Docker stack with an empty database instead of seeding it. |

For local development the `.env.example` values work unchanged.

---

## Run all tests

From the repo root, after [First-time setup](#first-time-setup-fresh-clone--new-machine)
(including `npx playwright install chromium`). No server needs to be running, and the dev database
is never touched:

```bash
(cd backend && npm run test:cov && npm run test:e2e)   # backend unit tests with coverage, then e2e
(cd frontend && npm run test:cov)                      # frontend tests with coverage
(cd frontend && npm run test:e2e)                      # browser E2E (Playwright + Chromium)
```

- `npm run test:cov` prints a coverage summary. Use `npm test` for the same run without coverage.
- The backend e2e suite runs the real app against its own `backend/prisma/e2e.db`, which it
  rebuilds on every run and deletes afterwards.
- The browser E2E suite (`frontend/e2e/`, config in `frontend/playwright.config.ts`) starts its
  own servers: the backend built and run on **:3100** and a Vite dev server on **:5174**, with the
  backend on its own SQLite file, `backend/prisma/playwright.db`, recreated at the start of every
  run (`dev.db` is untouched). It needs the backend set up (First-time setup: `npm install` +
  `prisma generate` in `backend/`), Chromium installed, and ports 3100 and 5174 free — it never
  reuses a server already running there. The first run takes a little longer (it builds the
  backend).
- What each suite covers is in the README's [Testing](README.md#4-testing) section.

---

## Run with Docker

The whole stack in containers, with only Docker installed (no host Node, npm or Prisma step).
Run from the repo root:

```bash
docker compose up --build         # builds both images, then starts backend + frontend
docker compose down               # stop; the database is kept
docker compose down -v            # stop and wipe the database (removes the volume; next up reseeds)
```

- **URLs:** the app is at http://localhost:8080 (nginx serving the built SPA; deep links like
  `/sign-up` reload fine). The API is at http://localhost:3000, and the browser calls it
  directly (no `/api` proxy). The frontend container waits for the backend's healthcheck.
- **Production-like, not a dev setup:** these are built images (`node dist/main` and a static
  bundle), with no hot reload. For development use `scripts/be-local` and `scripts/fe-local`.
  The two setups are independent. Docker doesn't touch `backend/prisma/dev.db` or
  `backend/.env`.
- **Data:** SQLite at `/data/app.db` on the named volume `starter-app_db-data` (the compose
  project name is fixed, so the name is the same whatever the checkout is called).
  `down` keeps it and `down -v` resets it.
- **Demo data:** on a fresh volume the backend seeds the demo accounts on start (see Backend →
  Seed data), so you can sign in right away: sign in at http://localhost:8080 as
  `demo@example.com` / `password1234`. It runs with `--if-empty`, so it only seeds while the
  database has no users: restarts (`down` + `up`) never reseed or wipe anything. For a fresh
  seeded stack, `docker compose down -v` then `docker compose up`. To boot with an empty
  database, `SEED_ON_START=false docker compose up` (only the exact value `false` skips it). A
  seed that fails stops the backend container before the API starts (check
  `docker compose logs backend`).
- **Schema:** each backend start runs `prisma db push` (no migrations, same as local), then the
  seed step above. The push does nothing when the schema is already in sync. A push that would
  lose data is **not** forced.
  The backend container fails (check `docker compose logs backend`) and nothing is wiped. To
  get past it, reset with `docker compose down -v`, or change the schema so the push is additive.
- **Changing the API URL / origin:** `VITE_API_URL` is baked into the bundle at build time, so
  changing it needs `--build`. Change `FRONTEND_ORIGIN` along with it. It must equal the origin the
  browser loads the frontend from **exactly** (scheme + host + port, no trailing slash), or CORS
  and the auth Origin check reject every request. Both are read from the host environment. For
  example:
  `VITE_API_URL=http://192.168.1.10:3000 FRONTEND_ORIGIN=http://192.168.1.10:8080 docker compose up --build`.
- **`NODE_ENV` defaults to `development`.** In this backend, `NODE_ENV` only sets the session
  cookie's `Secure` flag. Over plain `http://localhost`, some browsers (Safari) drop `Secure`
  cookies and sign-in silently fails. Set `NODE_ENV=production` only when the stack is behind
  HTTPS.
- **Observe APM (optional):** `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` pass through from the
  host environment when set there. Otherwise APM stays off, as it does locally.
- **Images:** the backend build stages use the full `node:22-bookworm` because `better-sqlite3@13`
  compiles from source (needs python3/make/g++). The runtime stage is `node:22-bookworm-slim`
  plus `openssl` (so Prisma picks its openssl-3 engine) and runs as the non-root `node` user.
  The frontend is built on `node:22-bookworm-slim` and served by `nginx:alpine`, with long-cache
  `/assets/*` and a no-cache `index.html`.
  Details are in the comments of `compose.yaml`, `backend/Dockerfile`, `backend/docker-entrypoint.sh`,
  `frontend/Dockerfile` and `frontend/nginx.conf`.

---

## Scripts index

- **`scripts/check-env`** — checks Node (^22.12, 24 or 26+, the `engines` range; see `.nvmrc`)
  and npm are installed, that `backend/node_modules` and
  `frontend/node_modules` are present, and that `backend/.env` exists. It also reports whether
  Docker (optional, for [Run with Docker](#run-with-docker)) is available. Read-only.
- **`scripts/be-local`** — `npm run start:dev` in `backend/` (foreground, logs, watch
  mode). Port comes from `PORT` in `backend/.env` if set, otherwise `src/main.ts` falls
  back to **3000**.
- **`scripts/fe-local`** — `npm run dev` in `frontend/` (foreground, Vite dev server,
  default port **5173** — Vite picks the next free port if it's taken).
- **`scripts/down-be`** / **`scripts/down-fe`** — stop everything `be-local` / `fe-local`
  (or a plain `npm run start:dev` / `npm run dev`) left behind: every `node` process whose
  command line points into `backend/node_modules/` / `frontend/node_modules/` (the nest / vite
  CLIs), killed with its whole process tree (so the `node dist/main` a `nest --watch` spawned,
  and Vite's esbuild service, go with it), then checks the port (`PORT` from `backend/.env` or
  3000 / 5173) is free. A backend started some other way (e.g. `npm run start:prod`, `node
  dist/main`) is reported and left running, as is anything else holding the port — the script
  then exits non-zero. Safe to run when nothing is up. Shared logic lives in
  `scripts/lib/stop-dev.sh`.

---

## Backend (`backend/`)

Plain NestJS app (`npm`, not part of a workspace). Reads config via `dotenv/config`
from `backend/.env` (create it from `backend/.env.example`; it's git-ignored).

- **Env vars** (validated at boot by `src/config/environment.validation.ts`, a Zod
  schema — an invalid/missing required var throws on startup rather than failing
  silently later): `PORT` (optional, defaults to 3000), `DATABASE_URL` (required —
  see Database below), `NODE_ENV` (optional, `development` | `production` | `test`,
  default `development`; `production` makes the session cookie `Secure`),
  `FRONTEND_ORIGIN` (optional, default `http://localhost:5173` — the exact frontend
  origin, no path or trailing slash; it's the only origin CORS allows and the one the
  auth guard's Origin check accepts), `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` (optional —
  [NestJS Observe](https://observe.nestjs.com) APM; the `ObserveModule` only
  registers itself in `src/app.module.ts` when **both** are set to a non-empty
  value, so leaving them blank is a normal, supported way to run without APM).
- **Database**: Prisma (`prisma/schema.prisma` — models `User` and `Session`; config
  in `prisma7.config.ts`),
  driver-adapter based (Prisma 7 requires one — `@prisma/adapter-better-sqlite3` +
  `better-sqlite3`, wired in `src/database/prisma.service.ts`). SQLite is a local
  file, not a server — `DATABASE_URL` in `.env`/`.env.example` is a `file:` URL
  (default `file:./dev.db`), not a Postgres connection string. The database
  lives at `backend/prisma/dev.db` and is git-ignored (`.gitignore`'s
  `/prisma/*.db*`), so a fresh clone doesn't have it — create it with
  `npx prisma db push` (from `backend/`). Both `src/database/prisma.service.ts` and
  `prisma7.config.ts` explicitly resolve a relative SQLite path anchored to
  their own module's location (not `process.cwd()`), so the CLI
  (`prisma generate`/`db push`) and the running app always agree on the same
  physical file regardless of the directory a command is invoked from.
  Regenerate the client after schema changes: `npx prisma generate` (run from
  `backend/`).
- **Config**: `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true, ... })` in
  `app.module.ts`), loading `src/config/configuration.ts` and validating through
  `src/config/environment.validation.ts`.
- **Cross-cutting**: the HTTP pipeline lives in `src/app.setup.ts`
  (`configureApp(app)`), shared by `main.ts` and the e2e suite so tests run the same
  stack: `helmet()`, `cookie-parser`, CORS restricted to `FRONTEND_ORIGIN` with
  `credentials: true`, a global `ValidationPipe` (`whitelist: true, transform: true`, no implicit conversion — a wrong JSON type is a 400; numeric query params declare `@Type(() => Number)`),
  and a single global `AllExceptionsFilter` (`src/common/filters/`) that normalizes
  every error response to `{ statusCode, message, timestamp, path }`.
- **Response serialization**: a global `ResponseSerializerInterceptor`
  (`src/common/interceptors/`, in `configureApp`) emits only `@Expose()`d fields of the
  response DTO each handler declares via `@SerializeOptions({ type: XResponseDto })`
  (e.g. `UserResponseDto`); a body without a declared DTO is a 500 (fails closed). Never
  return Prisma models. 204 endpoints return no body.
- **Auth** (`src/auth/`, users in `src/modules/users/`) — email + password, server-side
  sessions in an httpOnly `sid` cookie. These are the API's only endpoints:

  | Method + path | Result | Errors |
  |---|---|---|
  | `POST /auth/sign-up` `{ email, username, displayName, password }` | 201 + cookie, `{ id, email, username, displayName }` | 409 `Email is already registered` / `Username is already taken`; 400 on invalid input; 429 |
  | `POST /auth/sign-in` `{ email, password }` | 200 + cookie, `{ id, email, username, displayName }` | 401 `Invalid email or password` (unknown email and wrong password alike); 400; 429 |
  | `POST /auth/sign-out` | 204, revokes the session and clears the cookie (public and idempotent) | — |
  | `GET /auth/me` | 200 `{ id, email, username, displayName }` | 401 without a live session |

  - **Every other route requires a valid `sid` cookie** — a global
    `AuthGuard` (`APP_GUARD`); opt a route out with `@Public()`. POST/PUT/PATCH/DELETE with
    an `Origin` other than `FRONTEND_ORIGIN` get 403, public routes included.
  - **Rate limits:** sign-up and sign-in are limited to 5 requests/minute per IP, per route
    (429 `Too many requests, please try again later`; rejected 400s count too).
  - **Email:** trimmed + lowercased, a valid email, max 254, unique.
  - **Password:** 12–128 characters at sign-up; sign-in only requires a non-empty value (max 128).
  - **Username:** trimmed + lowercased, 3–20 chars of `a-z0-9_`, not a reserved word (`me`,
    `settings`, `sign-in`, `sign-up`, `sign-out`, `auth`, `users`, `u`, `api`, `admin`, `root`),
    unique (any case).
  - **Display name** (`displayName`): trimmed, then 1–50 characters counted as Unicode code points
    (an emoji counts 1), no line breaks; not unique, any case kept. **Required at sign-up**
    (missing/blank → 400). `GET /auth/me` returns `displayName: null` for accounts created before
    display names existed.
  - `src/modules/users/username.rules.ts` is authoritative; the frontend copy in
    `frontend/src/lib/validation/user-schemas.ts` (incl. `RESERVED_USERNAMES`) must match.
- **Seed data** (`src/database/seed/`) — a fixed set of demo accounts so you can sign in right
  away. Needs the schema first (`npx prisma db push`). From `backend/`:

  | Command | What it does |
  |---|---|
  | `npm run db:seed` | Builds (`nest build`), then runs the compiled seed (`dist/database/seed/seed.js`). **Resets the data.** |
  | `npm run db:seed -- --if-empty` | Seeds only if the DB has no users; otherwise leaves it untouched. |
  | `npx prisma db seed` | Same as `npm run db:seed` (configured in `prisma7.config.ts`); `npx prisma db seed -- --if-empty` forwards the flag. |

  - **It wipes the database's data.** In one transaction it deletes **every** session and user —
    including accounts you created yourself — then inserts the seed users. Everyone is signed out
    (sessions are gone). Re-running it always gives the same accounts, never duplicates. The schema
    isn't touched.
  - **What it creates:** 3 users. Ids change on every run.
  - It prints `Seeded 3 users`; on failure it exits non-zero and the transaction leaves the
    data as it was.
  - **Credentials** — every seed user's password is `password1234`:

    | Email | Password | Username | Display name |
    |---|---|---|---|
    | `demo@example.com` | `password1234` | `demo` | Demo User |
    | `alice@example.com` | `password1234` | `alice` | Alice Example |
    | `bob@example.com` | `password1234` | `bob` | Bob Example |

  - Docker runs it on first boot with `--if-empty` (see [Run with Docker](#run-with-docker)). The
    e2e suite never uses the dev DB (the seed's own e2e spec runs on `prisma/e2e-seed.db`).
- **Run**: `start:dev` (watch mode, what `scripts/be-local` uses), `start` (no watch),
  `start:debug`, `start:prod` (runs the compiled `dist/`).
- **Test**: `test` (Vitest unit), `test:watch`, `test:cov` (coverage), `test:debug`,
  `test:e2e` (`vitest.config.e2e.ts`). Unit specs live in a `__tests__/` folder next to the code
  they cover (`src/auth/__tests__/auth.service.spec.ts`); e2e lives in `test/` and runs against its
  own SQLite file, `prisma/e2e.db` (git-ignored), rebuilt from the schema at the start of every run
  and deleted after — it never touches `prisma/dev.db`.
- **Build**: `build` (`nest build`), `deploy` (`nest deploy`, via `@nestjs/mau`).
- **Lint/format**: `lint` (`oxlint src/ test/`), `format` (`prettier --write`).

---

## Frontend (`frontend/`)

Vite + React SPA in strict TypeScript (`npm`, not part of a workspace) — Tailwind CSS v4,
shadcn/ui (Radix base, Nova preset), and `react-router` for client-side routing.

- **Run**: `dev` (Vite dev server, what `scripts/fe-local` uses), `preview` (serves the
  production build).
- **Build**: `build` (`tsc -b && vite build` — a type error fails the build).
- **Typecheck**: `typecheck` (`tsc -b`; `tsconfig.app.json` covers `src/`, `tsconfig.node.json`
  covers `vite.config.ts`, `playwright.config.ts` and `e2e/`). API response shapes live in `src/lib/api/types.ts`.
- **Lint**: `lint` (`eslint .`, with `typescript-eslint` recommended).
- **Browser E2E**: `test:e2e` (`playwright test`, Chromium only). Specs in `e2e/*.spec.ts`
  (`e2e/auth.spec.ts`: sign up → Home → sign out → gated redirect → sign in, plus a wrong
  password; shared helpers in `e2e/helpers.ts`), config in `playwright.config.ts`. It starts its own backend (:3100, built and
  run from `../backend` against `prisma/playwright.db`, recreated each run) and Vite (:5174); see
  [Run all tests](#run-all-tests). One-time `npx playwright install chromium`. Not part of
  `npm test` (Vitest only includes `src/**`).
- **Test**: `test` (`vitest run`), `test:watch`, `test:cov`. Vitest + jsdom + React
  Testing Library, config in `vite.config.ts`'s `test` block. Tests live in a
  `__tests__/` folder next to the code they cover (`src/**/__tests__/*.test.{ts,tsx}`). Shared helpers live in `src/test/`: `setup.ts`
  (jest-dom matchers, MSW lifecycle), `server.ts` (MSW server + default handlers;
  `VITE_API_URL` is pinned to `http://api.test` in tests, build URLs with
  `apiUrl()`), `render.tsx` (`renderWithProviders` — QueryClient from the app's
  `createQueryClient` + `AuthProvider` + MemoryRouter). Unhandled requests fail the
  test. Tests render **signed in** by default (the default MSW `GET /auth/me` handler
  returns a user, `ada`); override it with a 401 (`server.use(...)`) to render signed out.
- **Structure** (`src/`): `app/` (`App.tsx`, `router.tsx`, `providers.tsx`, `query-client.ts`),
  `components/ui/` (shadcn), `components/AuthLayout.tsx`, `components/BrandMark.tsx`,
  `hooks/use-mobile.ts` (shadcn), `lib/api/` (`client.ts`, `error-message.ts`, `types.ts`),
  `lib/auth/` (`AuthProvider`, `useAuth()`, `redirect-target.ts`), `lib/validation/`
  (`auth-schemas.ts`, `user-schemas.ts`), `lib/utils.ts`, `routes/` (`ProtectedRoute`,
  `PublicOnlyRoute`), `pages/` (`Home`, `SignIn`, `SignUp`, `SignOut`), `test/`.
- **API client** (`src/lib/api/client.ts`) — reads `VITE_API_URL` from
  `frontend/.env` (defaults to `http://localhost:3000`; Vite only exposes
  `VITE_`-prefixed vars to client code). Sends `credentials: 'include'` so the
  browser attaches the httpOnly session cookie; no token is ever handled in JS.
- **Auth** — `useAuth()` (`src/lib/auth/use-auth.ts`) gives `{ user, isAuthenticated,
  isLoading, isError, isFetching, refetch, signIn, signUp, signOut }`, backed by a
  `GET /auth/me` query. Public routes: `/sign-in`, `/sign-up` (wrapped in
  `PublicOnlyRoute` — signed-in users go back to the originally requested in-app route
  via `src/lib/auth/redirect-target.ts`, else `/`) and `/sign-out`; everything else is
  behind `ProtectedRoute` (redirects to `/sign-in`, then back to the requested route
  after signing in). Only a 401 from `/auth/me` means signed out; any other failure
  (500, network) makes `ProtectedRoute` show a "Couldn't reach the server" alert with a
  Retry button instead of redirecting. A 401 from any other
  query/mutation is handled centrally in `src/app/query-client.ts` (user reset to
  signed out, other cached queries dropped).
- **TanStack Query** — `QueryClientProvider` (+ `AuthProvider`) lives in
  `src/app/providers.tsx`, wrapping `<App>` in `main.tsx`. React Query Devtools are
  mounted in dev only.
- **Forms** — `react-hook-form` + `zod` (`@hookform/resolvers`), used by the sign-in and
  sign-up pages; schemas in `src/lib/validation/auth-schemas.ts` and
  `user-schemas.ts` (username / display-name rules, mirroring the backend).
- **Brand + theme** — the app is "Starter App" (`index.html` title, box favicon; every page sets
  `<page> · Starter App` via `components/AuthLayout.tsx`). Palette tokens (light + dark),
  Geist Sans + Geist Mono live in `src/index.css`. Dark mode follows the OS (no toggle):
  a custom `dark` variant matches `.dark` or `prefers-color-scheme: dark`. `index.css` also sets
  `scrollbar-gutter: stable` on `html`, so content doesn't shift sideways between pages with and
  without a vertical scrollbar (with a matching override so opening a dialog doesn't shift it
  either).
- **Pages** — every page renders inside `AuthLayout` (brand mark + name above a centred column):
  - `/sign-in` — email + password; a wrong password shows "Invalid email or password", a 429
    "Too many attempts. Try again in a minute."
  - `/sign-up` — Name (sent as `displayName`), Username, Email, Password, Confirm password.
  - `/sign-out` — signs out on mount, then goes to `/sign-in`.
  - `/` (Home) — a card with the signed-in user's display name (or username), `@username`, email
    and a Sign out link. Any other path redirects to `/`.

---

## Cross-platform

Scripts are `bash`; on Windows run them from **Git Bash** (or WSL). `node` and `npm`
must be on `PATH`.

---
