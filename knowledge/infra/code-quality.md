---
title: Code quality
type: infra
summary: Alejandro's cross-project code-quality and architecture preferences — pragmatic layered design, explicit list of patterns to avoid, and what "tests" means per layer — applied to the single Next.js app (route handler → service → repository → Prisma).
status: active
last-verified: 2026-10-19
tags: [code-quality, architecture, conventions, tests]
---

# Code quality

Configure:

* TypeScript strict mode
* ESLint
* Prettier
* Tests
* Import aliases
* Naming conventions
* Build scripts
* Lint scripts
* Test scripts

Avoid:

* `any`
* Extremely large files
* Controllers (route handlers) with business logic
* Services that access Prisma directly
* Repositories with business rules
* React components with complex API logic
* Circular dependencies
* Unnecessary base classes
* Hexagonal Architecture
* Clean Architecture
* CQRS
* Event Sourcing

I do not want:

* You to write function(arg: string | undefined) prefer function(arg?: string) instead
* Ports and adapters
* Separate use case classes
* Unnecessary repository interfaces
* Complex domain layers
* Injection tokens for every repository
* Excessive abstractions
* Microservices

I want a traditional, clear, and pragmatic architecture:

```text
Controller   (in Next.js: the route handler)
Service
Repository
ORM
```

# Tests

Server:

* Unit test for a service
* Mocked repository
* Route handler test — the integration tier: real handler, real session, real Postgres
* Authorization test for every endpoint (401 / cross-tenant 404 / role 403 / invalid 400 / success)
* Repository test when useful (integration tier)

Client:

* Component test
* Protected route / page test
* Form test (validation, pending, failure)
* API hook test

# Conventions for this app

How the preferences above map onto TenantDesk — see [[App architecture]] for the full layout and
[[Tenancy and authorization]] for the security rules.

## Server (`src/server/`)

```text
src/server/<area>/
├── <area>.repository.ts   # only file importing `db`; tenant-owned queries require tenantId
├── <area>.service.ts      # authorization + business rules + transactions
├── <area>.dto.ts          # toXDto(row) mappers — what may leave the API
└── __tests__/
```

* Route handlers are thin: `requireSession`, parse with the shared Zod schema, call one service
  function, return `json(dto)`; errors go through `http.ts`.
* Plain exported functions; no classes for DI, no repository interfaces.
* `import 'server-only'` at the top of everything under `src/server/`.
* One `PrismaClient` (`src/server/db.ts`); never construct another (the seed script is the only
  exception — it runs outside Next).

## Client (`src/app/`, `src/components/`, `src/lib/`)

* Server state via TanStack Query; HTTP only through `src/lib/api-client.ts`.
* Forms: React Hook Form + Zod (`src/lib/schemas/`, shared with the server).
* shadcn primitives first — [[Shadcn component preference]].
* Server components may call services directly; client components call the API.

## Tooling

* **TypeScript strict** (`strict`, `noUncheckedIndexedAccess`); `npm run typecheck`.
* **Lint** — ESLint (Next config + `typescript-eslint`), `npm run lint`. Prettier for formatting.
* **Import alias** — `@/*` → `src/*`.
* **Tests** — Vitest (unit + integration), Playwright (e2e). See [[App architecture]] → Tests.
