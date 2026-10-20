---
title: Deployment — Vercel + Neon
type: infra
summary: How TenantDesk is deployed — Vercel preview, Neon Postgres provisioned through the Vercel integration, env vars, migrations at build, manual seed, Deployment Protection, and how to report a failed deploy. Target state; mark "active" after the first successful deploy.
status: active
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
| `SEED_USER_PASSWORD` | chosen by Alejandro | Sensitive, Preview + Production; the build seeds when it's set |

Local `.env.example` lists every var with placeholder values. `.env*` (except `.env.example`) is
gitignored.

## Build & release

- Build: `npm run vercel-build` → `scripts/vercel-build`: `prisma generate`, `prisma migrate
  deploy`, the idempotent seed (only if `SEED_USER_PASSWORD` is set), `next build`.
- **The Neon integration's variables are Sensitive** — `vercel env pull` returns placeholders, so
  nothing can reach Neon from a local shell with pulled env. That's why seeding happens in the
  build. To run SQL against Neon by hand, copy the connection string from the Neon console.
- Preview and Production share **one** Neon database (the integration wires both to it), so every
  branch's migrations land there.
- Deployment Protection: off for Preview, or a bypass link shared privately with the reviewer.
- Verify: `scripts/smoke-authz <preview-url>` (401 / cross-tenant 404 / viewer 403).

## When a deploy fails

Don't hide it. Keep the repo state, and record in the submission: the commit SHA, the exact
command, the build-log excerpt with the error, and local reproduction commands.

## Open questions

- Production environment: not needed for the assessment (preview only).
