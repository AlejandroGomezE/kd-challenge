# CONVENTIONS.md — TenantDesk workflow (execution contracts)

> Conventions every skill/agent in this flow follows. The full flow lives in
> [`WORKFLOW.md`](./WORKFLOW.md). Stack-specific code conventions (layering, what goes where) live in
> `knowledge/` — this file is about *how the flow runs*, not about Next.js/React style. *What* to
> build is `docs/build-spec.md`.

## 0. Language

Artifacts (`feature.md`, skills, this file, `docs/`) are written in **English**. Converse with Alejandro in
whatever language he uses. Code identifiers are always English.

## 1. Feature slug

Kebab-case from the feature name (e.g. "password reset" → `password-reset`). It's the key everywhere:
`features/<slug>/`, the branch name, the PR title.

## 2. Per-feature state — `features/<slug>/feature.md`

One file. Frontmatter + sections:

```markdown
---
slug: <slug>
status: framed | building | verifying | done
scope: server | client | full-stack
next: /<skill> <slug>        # the exact next command — rewritten at every phase close
---
# <Feature>

## Plan
<touched surface + acceptance criteria (2-4 bullets) + anything the change must not break>

## Tasks
- [ ] (T2, client, after: T1) <task>
- [x] (T1, server) <task> — done

## Decisions
- <what was decided and why, including anything escalated to Alejandro and how it resolved>

## Follow-ups
- [ ] <out-of-scope thing noticed along the way> · <why it's out of scope>

## Log
- <date> · framed
- <date> · built — <one line>
- <date> · verified — <one line>
- <date> · closed — PR #<n>, merged
```

 Dates are plain (`YYYY-MM-DD` or
looser) — this isn't timing-instrumented, it's just enough to resume cold.

## 3. Status vocabulary

`framed` · `building` · `verifying` · `done` · `blocked` (waiting on a decision from Alejandro).

## 4. Orchestration

`/feature <name>` frames and hands off. Each phase is its own skill; it reads `features/<slug>/`,
does its work, updates `feature.md`, and tells you the next command. **The human advances** — no
silent auto-chaining between phases.

## 5. Code search

Use `Grep`/`Glob`, or `rg` via Bash for what they can't express. Exclude `node_modules/`, `.next/`
and `src/generated/`. There's no semantic-search MCP in this workspace.

## 6. When to stop and ask

Stop and ask Alejandro, rather than guessing, when: there's no precedent in the codebase for the
decision, an implementer/reviewer disagree twice in a row, a product question has no owner, or the
spec is silent on who may read/write something. Write
the question and its answer under `## Decisions` once resolved, so it doesn't get re-asked.

## 7. Publishing feature state

When a phase closes: commit **only** `features/<slug>/` (never mix in product code or `.claude/`
itself), and rewrite `next:` in the frontmatter to the exact next command. Push if you can; if the
push fails, commit anyway and say the push is owed. Also update `docs/ai-log.md` (§11) — it may be
committed together with the feature state.

## 8. PR review — no execution by default

A review (`/review-pr`, or the `reviewer` agent) reads the diff and reports; it does **not** run
builds, tests, migrations or seeds, and does **not** touch the branch (no checkout, merge, rebase, push,
commit) unless explicitly asked to. The rules for what counts as a finding live in
`review-contract.md` — this file only says a review doesn't execute or mutate by default.

## 9. Commit messages

Conventional-commit style, one line, imperative mood: `<type>(<slug>): <summary>`.

| Type | For |
|---|---|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting only (whitespace, semicolons) — no logic change |
| `refactor` | Rewrites code cleaner without adding a feature or fixing a bug |
| `test` | Adds or updates tests |
| `chore` | Maintenance — deps, build tools, and this flow's own feature-state bookkeeping |

**Feature-state commits** (`features/<slug>/feature.md` and nothing else — §7 above) are always
`chore(<slug>): <what happened>`, e.g. `chore(tenantdesk): frame feature`,
`chore(tenantdesk): build complete`, `chore(tenantdesk): closed`.

**Product-code commits** (the actual diff, at Close) use whichever type genuinely describes the
change — usually `feat` or `fix`; reach for `refactor`/`test`/`style`/`docs` only when that's really
all the commit does. Pick the type from what the diff does, not by default. PR titles follow the same
format.

## 10. Dev servers — leave nothing running

Any phase that starts the app (`scripts/dev`, `npm run dev`, `npm run start`, Playwright's web
server) stops it before handing off: run `scripts/down` (and `scripts/down <port>` for any other
port used) as the phase's last step, and confirm it reports the port free. It kills the Next.js
tooling running out of the repo's `node_modules/` with its whole process tree, so it's safe to run
even when nothing is up. Anything else holding the port is reported, never killed — tell
Alejandro. Local Postgres (`docker compose`) may stay up; it isn't a dev server.

## 11. AI log — `docs/ai-log.md`

The assessment requires the real prompt history. Keep it **while working**, not afterwards:

- The first prompt of the timed session goes in §1 **verbatim**.
- Follow-up prompts that changed the outcome go in §2 with the relevant response or diff excerpt —
  at least two by the end.
- Any suggestion Alejandro (or a reviewer agent) rejected or corrected goes in §3 with what was done
  instead. If none occurred, §3 says exactly that — **never invent one to fill the log**.
- Checks Alejandro performed himself go in §4; don't tick a box for him.
- Redact secrets, cookies, tokens, passwords and connection strings as `[REDACTED]`.

Skills append to it at phase close (`/feature`, `/implement`, `/review-feature`, `/close-feature`);
a skill that has nothing real to add adds nothing.

## 12. Databases and secrets

- Integration/e2e tests use **only** the `tenantdesk_test` database. `prisma migrate reset` (or any
  wipe) runs only against a URL whose database name ends in `_test` — check before running.
- Never run migrations, resets or seeds against the Neon preview DB without Alejandro saying so in
  this session; the preview seed is a deliberate, logged step (`knowledge/infra/deployment.md`).
- `.env*` files (except `.env.example`) are never read aloud, committed, pasted into logs or PRs.
  `SEED_USER_PASSWORD` and `BETTER_AUTH_SECRET` never appear in the repo.
- No real customer data, ever — seed data uses `.test` domains.
