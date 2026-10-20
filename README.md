# TenantDesk

A tiny project tracker for two organizations — one vertical slice of multi-tenant authorization.
Next.js (App Router) · Better Auth · Prisma · PostgreSQL (Neon via Vercel).

> **Status: pre-timer starter.** Only the standard framework/auth starter exists. What will be
> built is in [`docs/build-spec.md`](docs/build-spec.md); what existed before the timer is in
> [`docs/starting-conditions.md`](docs/starting-conditions.md). This README is rewritten for the
> submission (spec §9).

## Starter quickstart

```bash
cp .env.example .env            # fill BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d            # local Postgres: tenantdesk + tenantdesk_test
npm install
npx prisma migrate deploy
npm run dev                     # http://localhost:3000
```
