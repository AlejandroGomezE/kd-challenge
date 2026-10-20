# Starting conditions (recorded before the timer)

Fill in **before** the timed assessment starts. Setup time is unscored; this record keeps
starting conditions comparable and honest. See [`build-spec.md`](build-spec.md) §2.

## Previous code

- Prior NestJS + Vite starter lived at commit: `<sha>` (removed/archived in commit `<sha>`).

## Starter

| Item | Value |
|---|---|
| Framework starter command | `npx create-next-app@<version> ...` |
| Next.js / React / TypeScript versions | |
| Auth starter | Better Auth `<version>` — email + password, Prisma adapter (docs URL followed: ) |
| Prisma version | |
| Node version | |
| Starter commit SHA (timer start) | |
| Bare starter preview URL | |

## What existed before the timer

- Next.js app with Better Auth sign-in page and its tables only (one migration).
- Local Postgres via `compose.yaml`; Neon database attached through Vercel.
- Vitest + Playwright installed, one trivial test each.
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
