---
title: Tenancy and authorization
type: decisions
summary: How TenantDesk decides who may do what — server-resolved identity, URL-requested tenant verified against Membership, role thresholds, 401/403/404 policy, tenant-scoped queries, DB-level tenant consistency; application authorization is the boundary and RLS is a stretch goal.
status: active
last-verified: 2026-10-19
tags: [tenancy, authorization, security, rls, postgres, roles]
---

# Tenancy and authorization

## Decision

1. **Identity is resolved on the server** from the Better Auth session on every request. Nothing
   the client sends identifies the user.
2. **A client-selected tenant is a request, not authorization.** The tenant comes from the URL
   slug and is only honoured after `Membership(tenantId, userId)` is found for the session user.
   The resulting `TenantContext.tenantId` is the only tenant id repositories ever see. A
   `tenantId` in a body or query string is rejected (strict schemas).
3. **Roles:** `viewer` < `editor` < `admin`. Read = any member. Write = `editor`+. `admin` has no
   extra powers in this slice.
4. **Status policy:**
   - no/invalid session → **401**
   - tenant doesn't exist **or** user isn't a member → **404** (identical, so tenant existence
     doesn't leak)
   - member with insufficient role → **403**
   - object id that isn't in the active tenant → **404**
5. **One choke point:** `requireSession` + `requireMembership(user, slug, minRole)` in
   `src/server/tenancy/tenancy.service.ts`. Every route handler and server component goes through
   it. Next's proxy (`src/proxy.ts`, formerly middleware) is never relied on for authorization.
6. **Database enforces tenant consistency**, independent of app code: composite FK
   `AuditEntry(tenantId, projectId) → Project(tenantId, id)`, unique `(tenantId, lower(name))`,
   Membership PK `(tenantId, userId)`, `tenantId` leading every tenant-owned index.
7. **Writes and their audit entry are one transaction** (`db.$transaction`). Proven by a test that
   forces the audit insert to fail and asserts the write rolled back.
8. **RLS: stretch goal.** Application authorization is the boundary for the core slice. RLS on
   `Project`/`AuditEntry` (non-owner role, `FORCE ROW LEVEL SECURITY`,
   `set_config('app.tenant_id', …, true)` per transaction) is added only if time allows. The
   README states exactly what shipped — never claim RLS that isn't enforced.

## Why

- The assessment's reviewer will try A → B access and a viewer write; those must fail at the
  server and be provably tested against the real boundary (real session, real handlers, real DB).
- 404 for non-members avoids confirming another tenant exists.
- RLS with Prisma + Neon pooling is doable but costly in a timed slice; tenant-scoped repositories
  plus DB constraints give strong guarantees with less risk of a half-working RLS setup.

## How this applies

- A new tenant-owned table gets `tenantId`, a composite unique `(tenantId, id)` if anything
  references it, `tenantId`-leading indexes, and repository functions that **require** `tenantId`.
- A repository function over tenant-owned data without a `tenantId` parameter is a review Blocker.
- Every new endpoint gets rows in the integration authorization matrix (401 / cross-tenant 404 /
  viewer 403 / invalid 400 / happy path).

## Open questions

- Whether RLS ships (decided at the cut line, `docs/build-spec.md` §10).
