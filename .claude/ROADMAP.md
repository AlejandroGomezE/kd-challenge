# ROADMAP.md — TenantDesk workflow (deferred / open)

Short list of what this flow (and the app it governs) deliberately doesn't handle yet. Product
scope limits live in `docs/build-spec.md` §11.

- **The app isn't scaffolded yet.** `knowledge/infra/app-architecture.md`, `deployment.md` and
  `ui-component-inventory.md` are `status: planned`. Flip them to `active` (and correct them)
  once the starter / slice exists.
- **README.md and Runbook.md still describe the old NestJS + Vite starter.** They're rewritten for
  TenantDesk as part of the submission (`docs/build-spec.md` §9); `Runbook.md` folds into the
  README or is deleted.
- **RLS is a stretch goal** — application authorization is the boundary
  (`knowledge/decisions/tenancy-authorization.md`).
- **No rate limiting** on sign-in beyond what Better Auth does by default.
- **Deploys:** Vercel's Git integration builds a preview for every pushed branch; there is no
  production environment for the assessment. The preview DB is seeded by hand
  (`knowledge/infra/deployment.md`).
