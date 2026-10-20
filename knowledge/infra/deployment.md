---
title: Deployment — Vercel + Neon
type: infra
summary: How TenantDesk is deployed — Vercel preview, Neon Postgres provisioned through the Vercel integration, env vars, migrations at build, manual seed, Deployment Protection, and how to report a failed deploy. Target state; mark "active" after the first successful deploy.
status: planned
last-verified: 2026-10-19
tags: [deploy, vercel, neon, postgres, env, migrations]
---

## Topology

```text
Browser ──► Vercel (Next.js, Node runtime functions) ──► Neon Postgres (pooled endpoint)
                       build step ──► Neon (unpooled endpoint) — prisma migrate deploy
```

## Database: Neon via Vercel

- Created from the Vercel dashboard (Storage → Neon), which links it to the project and injects
  `DATABASE_URL` (pooled, PgBouncer) and `DATABASE_URL_UNPOOLED` (direct) into the environments.
- Runtime: `PrismaClient` with `@prisma/adapter-pg` on `DATABASE_URL`.
- Migrations: `prisma.config.ts` points the CLI at `DATABASE_URL_UNPOOLED` (migrations and
  advisory locks don't go through the pooler).
- Optional: a Neon branch per preview deployment — not required for the slice.

## Env vars (Vercel → Settings → Environment Variables)

| Var | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Neon integration | pooled |
| `DATABASE_URL_UNPOOLED` | Neon integration | direct, for migrations |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | never committed |
| `BETTER_AUTH_URL` | stable preview alias | also in Better Auth `trustedOrigins` |
| `SEED_USER_PASSWORD` | local shell only | **not** set in Vercel; used once to seed |

Local `.env.example` lists every var with placeholder values. `.env*` (except `.env.example`) is
gitignored.

## Build & release

- Build command: `prisma generate && prisma migrate deploy && next build`.
- Seed once, from a local shell:
  `vercel env pull .env.preview.local --environment=preview` then
  `SEED_USER_PASSWORD=… npx dotenv -e .env.preview.local -- npx prisma db seed`.
  Log the command + redacted output in the submission.
- Deployment Protection: off for Preview, or a bypass link shared privately with the reviewer.
- Verify: `scripts/smoke-authz <preview-url>` (401 / cross-tenant 404 / viewer 403).

## When a deploy fails

Don't hide it. Keep the repo state, and record in the submission: the commit SHA, the exact
command, the build-log excerpt with the error, and local reproduction commands.

## Open questions

- Production environment: not needed for the assessment (preview only).
