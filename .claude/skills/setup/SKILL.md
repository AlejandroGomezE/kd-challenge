---
name: setup
description: Verify the machine can run TenantDesk (Next.js app, Docker Postgres, Vercel + Neon, gh) and offer to fix gaps. Runs scripts/check-env, reports OK/MISSING, and with confirmation spawns the installer agent per gap. Triggers on "setup", "check my environment", or "/setup".
argument-hint: none, or --fix
---

# Setup — environment check

Verify this machine can run the app end-to-end, and help close any gaps. Read-only by default — you
never install or configure anything yourself; fixes go through the `installer` agent, one item at a
time, with confirmation.

## Step 1. Run the real check

```bash
bash scripts/check-env
```

This already covers: Node (^22.12, 24 or 26+), npm, docker compose, `psql` (optional), `vercel`
CLI, `gh`, whether the app is scaffolded (root `package.json`, deps, `prisma/schema.prisma`),
`.env` with `DATABASE_URL` / `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `SEED_USER_PASSWORD`, and
whether the compose Postgres is running. It never prints `.env` values.

Add, read-only, what the script doesn't:
- `git config user.name` / `user.email` set.
- `gh auth status` and `vercel whoami` (the script only checks the binaries).
- If the app is scaffolded: `npm run build` succeeds, and `npx prisma migrate status` against the
  **local** DB.
- `vercel env ls` shows `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL` for Preview (names only — never pull or print values here).

**Before the timer** (`docs/build-spec.md` §2) "not scaffolded" is expected and is reported as a
pre-timer TODO, not a failure.

## Step 2. Present the checklist

In the user's language, one line per item: OK / MISSING / WARN, with what it blocks if missing (e.g.
"gh not authenticated → blocks opening PRs at Close").

## Step 3. Fix gaps, with confirmation

No MISSING items → say so, stop. Otherwise: ask which to fix (or all, with `--fix`), then spawn the
`installer` agent **once per item** — never fix more than one thing per invocation. Run independent
items in parallel; sequence dependent ones (install before build).

## Step 4. Re-check and confirm

Re-run the checks that were addressed, report what's now green vs. still blocked (and the remaining
manual step, if any).

---

If something doesn't fit this checklist at all, say so plainly rather than guessing — this is a
prerequisite utility, not a feature phase, so there's no `feature.md` to record an escalation in;
just ask.
