---
title: UI component inventory
type: infra
summary: Which shadcn/ui primitives TenantDesk installs under src/components/ui (added on demand with `npx shadcn add`, not `--all`) and which app components compose them. Grounds the shadcn-first convention in knowledge/decisions/shadcn-component-preference.md. Update as components are added.
status: planned
last-verified: 2026-10-19
tags: [frontend, shadcn, ui, design-system]
---

# `src/components/ui` — component inventory

Plain files in the app (`@/components/ui/*`), installed with `npx shadcn@latest init` then
`npx shadcn@latest add <name>` **only when a feature needs one** — the slice wants minimal UI,
not the whole library. Stock and unmodified; per [[Shadcn component preference]], reach for one of
these before hand-rolling, and a genuinely new primitive needs Alejandro's review.

## Expected for the slice

| Primitive | Used for |
|---|---|
| `button` | submit, rename, retry, sign out |
| `input`, `label`, `field` | sign-in, create, rename forms |
| `card` | sign-in frame, tenant picker |
| `table` | project list |
| `badge` | role badge |
| `alert` | mutation / load failures |
| `skeleton` | list pending state |
| `empty` | no projects yet |
| `spinner` | submit pending |
| `select` or `dropdown-menu` | tenant switcher |

## Installed

_None yet — fill in as `shadcn add` runs._

## App components (outside `ui/`)

_None yet._ Expected: `components/projects/ProjectList.tsx`, `CreateProjectForm.tsx`,
`RenameProjectForm.tsx`, `TenantSwitcher.tsx`.
