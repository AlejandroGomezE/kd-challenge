# Starting conditions (recorded before the timer)

Fill in **before** the timed assessment starts. Setup time is unscored; this record keeps
starting conditions comparable and honest. See [`build-spec.md`](build-spec.md) §2.

## Previous code

- Prior NestJS + Vite starter lived at commit: `b52cb704c3c052d58658c6eb757cf8db1d947387` (removed in the next commit on branch `pre-timer-starter`).

## Starter

| Item | Value |
|---|---|
| Framework starter command | `npx create-next-app@16.4.2 tenantdesk --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --use-npm --skip-install --yes` (scaffolded in a temp dir, files moved to the repo root) |
| Next.js / React / TypeScript versions | 16.4.2 / 19.3.0 / 5.9.3 |
| Auth starter | Better Auth 1.7.11 — email + password, Prisma adapter, `nextCookies()`; schema from `npx auth@1.7.11 generate`; one migration `better_auth_init` |
| Prisma version | 7.10.1 + `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1 |
| Node version | 24.3.0 (npm 11.4.2) |
| Starter commit SHA (timer start) | |
| Bare starter preview URL | |

## What existed before the timer

- Next.js app (create-next-app defaults, incl. `cacheComponents: true`) with Better Auth wired at
  `/api/auth/[...all]`, a bare `/sign-in` page (sign in / show email / sign out) and a home page
  linking to it. Better Auth's four tables are the only migration. Sign-up is still enabled
  (Better Auth default). Verified locally against `next start`: sign-up 200, wrong password 401,
  sign-in 200, session returns the user, sign-out 200 then session `null` (throwaway user deleted).
- Local Postgres via `compose.yaml`; Neon database attached through Vercel.
- Vitest 5.0.5 (1 file / 1 test passing) + Playwright 1.64.1 with Chromium (1 test passing:
  home → sign-in). `npm run typecheck`, `npm run lint`, `npm run build` clean.
- `CLAUDE.md` importing Next's generated `AGENTS.md` ("read the bundled docs").
- `.claude/` feature workflow, `knowledge/` architecture docs and `docs/build-spec.md` —
  written with AI assistance (Claude Code) before the timer. No tenant, project, audit,
  seed or authorization code.

## Environment verified

- [ ] Editor
- [ ] Claude Code
- [ ] Local Postgres reachable (`psql`)
- [ ] Neon (via Vercel) reachable (`psql` with the unpooled URL)
- [ ] `vercel` CLI logged in, project linked, starter deployed and reachable
- [ ] `gh auth status` OK
- [ ] Starter: `npm run build`, `npm test`, sign-in works locally

## Timer

- Started: `<date time TZ>`
- Ended: `<date time TZ>`
