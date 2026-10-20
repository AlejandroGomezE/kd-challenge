# knowledge/

Project knowledge base for **TenantDesk** (a tiny two-tenant project tracker — one Next.js app,
Better Auth, Prisma, Postgres on Neon via Vercel): architecture, ops, and decisions that aren't
derivable from code or git history. What to build is in
[`docs/build-spec.md`](../docs/build-spec.md). Kept **out of `.claude/`** (the feature-workflow
definition) and **out of always-loaded context**.

## What belongs here

One self-contained doc per system/topic, with frontmatter and predictable section headings
(grep-friendly). The frontmatter convention:

```yaml
---
title: <short, specific title>
type: infra | decisions
summary: <1-3 sentences — what this doc is and why it exists>
status: planned | active | superseded   # planned = target state, code doesn't exist yet
last-verified: <ISO-date>
tags: [comma, separated, keywords]
---
```

A `planned` doc describes the intended design; flip it to `active` (and correct it) once the code
exists, so the doc matches what was actually built.

Subfolders by `type`:

- `infra/` — systems and architecture: [[App architecture]], [[Deployment — Vercel + Neon]],
  [[Code quality]], [[UI component inventory]].
- `decisions/` — a settled decision and its open questions, so it isn't re-litigated three
  sessions later: [[Tenancy and authorization]], [[Stack choice]],
  [[Shadcn component preference]].

There is no `legacy/` holding area for superseded docs — this is a solo project, so a doc that's
genuinely superseded is corrected in place (or deleted; git keeps history). The NestJS/Vite
architecture docs were deleted when the stack changed — see [[Stack choice]].
