---
title: Prefer shadcn/ui components; new components need human quality check
type: decisions
summary: The Next.js app (src/components/ui) defaults to existing shadcn/ui components over hand-built equivalents. Building a new component is allowed when nothing in shadcn fits, but it must pass Alejandro's human quality check before being accepted.
status: active
last-verified: 2026-10-19
tags: [frontend, shadcn, ui, design-system, convention, code-review]
---

# Shadcn component preference

## Decision

Default to an existing `shadcn/ui` component wherever one fits, instead of hand-building
an equivalent, for all UI work in the app — see [[UI component inventory]] for what's
installed. Primitives are added on demand (`npx shadcn@latest add <name>`), not all at once.

This is **not** a ban on new components. A genuinely new component is fine when nothing
suitable exists in shadcn — but it must pass a **human quality check** (Alejandro's
review) before it's accepted. It is never auto-approved just because an agent
implemented it and it typechecks/lints clean.

## Why

Alejandro's explicit preference (2026-09-10): consistency with the existing design
system, and avoiding reinventing components shadcn already covers.

## How this applies

- Check [[UI component inventory]] first before proposing or building a new component —
  it's very likely already covered.
- When a task genuinely requires a new component, flag it explicitly for Alejandro's
  review rather than assuming it's approved because it works and lints clean. There's
  no automated review pipeline in this repo to catch this otherwise — it relies on
  actually asking.

## Open questions

None yet.
