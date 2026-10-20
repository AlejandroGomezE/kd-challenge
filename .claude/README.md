# TenantDesk workflow

A lightweight feature-development flow for **TenantDesk**: one Next.js app at the repo root
(App Router · Better Auth · Prisma · Postgres on Neon via Vercel · TanStack Query · shadcn). One
person (Alejandro), one lane, four phases. What to build: [`../docs/build-spec.md`](../docs/build-spec.md).

## Structure

```
.claude/
├── WORKFLOW.md          # the flow: Frame → Build → Verify → Close
├── CONVENTIONS.md        # how skills/agents behave (feature state, AI log, when to ask, etc.)
├── review-contract.md    # the one PR-review rulebook (incl. tenancy/authorization rules)
├── ROADMAP.md            # known gaps in this flow / the app
├── skills/                # /feature, /implement, /review-feature, /close-feature, /review-pr, /setup
└── agents/                # implementer · reviewer · installer

docs/build-spec.md          # the TenantDesk spec (scope, schema, authz, tests, deploy, submission)
docs/ai-log.md              # AI prompt log kept during the timed session
docs/starting-conditions.md # what existed before the timer
features/<slug>/feature.md  # per-feature state (one file)
knowledge/                  # architecture + decisions agents read before writing code
scripts/                    # dev · down · check-env
```

## First run

```
/setup                  # check the environment (Node, Docker Postgres, .env, vercel, gh)
/feature <name>          # frame a slice from docs/build-spec.md §10 — Frame → Build → Verify → Close
```

Day-to-day commands (running the app, tests, seeding, deploying) live in the README once the app
exists (`docs/build-spec.md` §9).
