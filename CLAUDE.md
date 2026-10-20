@AGENTS.md

# TenantDesk

- What to build: `docs/build-spec.md`. How we work: `.claude/WORKFLOW.md` + `.claude/CONVENTIONS.md`.
- Architecture and decisions: `knowledge/` (read `knowledge/infra/app-architecture.md` and
  `knowledge/decisions/tenancy-authorization.md` before writing server code).
- Next.js here is 16.4 — check `node_modules/next/dist/docs/` before relying on memory
  (middleware is `proxy.ts`, `params` is a Promise, `cacheComponents` is on).
