---
name: review-feature
description: Use for the Verify phase of this repo's feature flow — after /implement (Build) is done. Runs the TenantDesk app for real (local Postgres + next dev) and checks the feature's acceptance criteria against the running app. Loops back to /implement if something's wrong. Triggers on "verify the feature", "review the feature", or /review-feature <slug>.
argument-hint: <slug>
---

# Verify: $ARGUMENTS

You are running **Verify** (`WORKFLOW.md`). This is a human checkpoint: the app runs for real, and
Alejandro confirms it actually does what `## Plan` in `features/<slug>/feature.md` says. It is not a
code review — it's driving the running app. When something's wrong, it's a loop back to `/implement`.

Read `WORKFLOW.md` and `CONVENTIONS.md` first. Write findings in English; talk to Alejandro in his
language.

---

## Step 1. Load context

`Read` `features/<slug>/feature.md`. If `status` isn't `verifying`, tell Alejandro to finish
`/implement <slug>` first — there's nothing running to check yet.

Build a short checklist from `## Plan`'s acceptance criteria.

## Step 2. Run it and drive the feature

Make sure local Postgres is up (`docker compose up -d`) and seeded (`npm run db:seed`), then start
the app with `scripts/dev` (or the project's `run` pattern), and actually use the feature — click
through it, and hit the endpoints with `curl` using real session cookies. **Don't substitute reading
code for running it.**

For a UI change, a real browser check (e.g. via a headless-browser driver, screenshotting the result)
is worth more than eyeballing JSX. For a server-only change, hitting the endpoint and checking the
response (and the rows in Postgres via `psql`) is the equivalent.

Walk the checklist:
- Every acceptance criterion, actually exercised.
- The states that matter (loading/error/empty/success) if the change has any.
- Anything the plan flagged as "must not break" — check it still works.
- **The reviewer's attacks, every time server code changed:** signed in as Ada (Acme only), read and
  write Globex's project (UI URL and API, both `/tenants/globex/…` and
  `/tenants/acme/projects/<globexId>`) → 404 and nothing changed; signed in as Vic (viewer), POST
  and PATCH → 403 and nothing changed; no cookie → 401. Check `AuditEntry` in `psql` after a real
  create/rename.

Record what passed/failed as you go. Don't fix anything here — Verify observes and reports; fixes
happen back in `/implement`.

When you're done driving it, **tear it down**: `scripts/down`, and check it reports the port free (`CONVENTIONS.md` §10). Don't leave servers running
while you wait for the verdict.

## Step 3. Present findings

Tell Alejandro, in his language: what passed, what didn't (each with what you expected vs. what
happened), and ask for the verdict — **approve** or **iterate**.

## Step 4. Route the outcome

- **Iterate** → keep `status: building` don't advance it, tell him to run `/implement <slug>` again
  with the findings, then come back here. Append the findings to `## Decisions` or a fresh note so
  the next `/implement` round has them.
- **Approved** → set `next: /close-feature <slug>` in the frontmatter (`status` stays `verifying` —
  `/close-feature` is the one that sets `done`). Add a `## Log` line:
  `- <date> · verified — <one line>`.

Any out-of-scope thing you notice while driving the feature goes under `## Follow-ups`, not fixed
silently and not forgotten.

Ask Alejandro which of these he checked himself and record only those in `docs/ai-log.md` §4.

Commit `features/<slug>/` (+ `docs/ai-log.md`) only, push — `chore(<slug>): verified` if approved,
`chore(<slug>): iterate — <short reason>` if not (`CONVENTIONS.md` §9).

> Next: `/close-feature <slug>` (if approved) or back to `/implement <slug>` (if iterating).

---

## Rules

- **Running evidence, not code reading.** Show it working; don't describe the source.
- **No dimension goes unassessed silently.** If you couldn't check something, say so explicitly and
  either iterate or note it under `## Follow-ups` — never a silent pass.
- **Alejandro decides.** Present, recommend, wait — don't decide for him.
