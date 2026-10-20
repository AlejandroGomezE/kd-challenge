---
title: Stack choice
type: decisions
summary: Why TenantDesk replaced the NestJS + Vite + SQLite starter with a single Next.js app, Better Auth, Prisma migrations and Neon Postgres (via Vercel) — and what that retires.
status: active
last-verified: 2026-10-19
tags: [stack, nextjs, better-auth, prisma, neon, vercel, decision]
---

# Stack choice

## Decision (2026-10-19, Alejandro)

- **One Next.js App Router app** at the repo root, replacing `backend/` (NestJS) and
  `frontend/` (Vite). Route handlers are the API.
- **Better Auth** (email + password, Prisma adapter, DB sessions) replaces the hand-rolled
  argon2 + cookie-session auth.
- **Prisma with `prisma migrate`** (committed migrations) replaces `db push`.
- **PostgreSQL on Neon**, created through Vercel's Neon integration, for the preview; local
  Postgres in Docker for dev and tests. SQLite is retired.
- **Vercel** hosts the preview.

## Why

The TenantDesk assessment requires Next.js, real Postgres, an established auth library, a
standard starter (comparable starting conditions), migrations, and a reachable preview. The old
starter met none of the first four. Better Auth keeps users/sessions in our own Postgres so
seeding and membership joins are plain SQL; Prisma is already familiar; Neon is what Vercel
provisions for Postgres and injects pooled + unpooled URLs automatically.

## What carries over

- Layering preference (handler → service → repository → ORM) — [[Code quality]].
- shadcn-first UI — [[Shadcn component preference]].
- The `.claude/` workflow (Frame → Build → Verify → Close), re-pointed at the single app.

## Open questions

None.
