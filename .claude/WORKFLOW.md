# WORKFLOW.md — TenantDesk workflow

> **Single source of the workflow.** A feature is owned end-to-end — one branch, one PR, in the
> single Next.js app at the repo root — and Alejandro iterates on it until it's right; he directs,
> agents execute. This is deliberately **one lane**: light in ceremony, not in safety.
>
> It lives at the **repo root** (`.claude/`), so a Claude Code session started from the repo root
> discovers it automatically.
>
> **What** gets built is `docs/build-spec.md`. This file is only **how**.

---

## The pipeline

```
Frame  →  Build  →  Verify  →  Close
 /feature   /implement   /review-feature   /close-feature
```

| Phase | Skill | What happens |
|---|---|---|
| **Frame** | `/feature <name>` | Confirm the slug and a one-paragraph scope (a slice of `docs/build-spec.md`), quickly check it doesn't already exist, write `features/<slug>/feature.md` with a short plan (touched surface + acceptance criteria pulled from the spec). |
| **Build** | `/implement <slug>` | Break the plan into a small task list; `implementer` ⇄ `reviewer` loop per task until each is done. You direct by iteration — you don't need to read every diff. |
| **Verify** | `/review-feature <slug>` | Run the app for real (`scripts/dev`, local Postgres) and check the acceptance criteria against it — including the cross-tenant and viewer-write attacks — then stop it (`scripts/down`). Loop back to Build if something's wrong. |
| **Close** | `/close-feature <slug>` | Write/run the tests the change needs (unit + the integration authorization matrix against real Postgres), open the PR, run a `review-pr` pass, merge with your explicit go-ahead, and stop any dev server left running (`scripts/down`). |

The loop that matters is **Verify → Build**: you don't advance linearly, you go back and iterate until
it's actually right.

### Slicing the assessment

`docs/build-spec.md` §10 is the priority order. Under time pressure, prefer **one feature
(`tenantdesk`) whose `## Tasks` follow that order** over many small features — the per-phase
bookkeeping commits are the overhead to minimize. Split only if a slice is large enough to want its
own PR. Respect the cut line: anything below it starts only once everything above is green.

There is no separate "standard" track with more phases and formal gates. If a change turns out to be
large enough to want that, say more up front at Frame time — the same four phases still apply.

---

## Roles

One person, Alejandro, doing everything: framing, directing the build, verifying, deciding whether
to merge. Every check Alejandro performs personally goes in `docs/ai-log.md` §4.

---

## Per-feature state — `features/<slug>/`

One file per feature, at the repo root (tracked and versioned):

```
features/<slug>/feature.md
```

Sections: a short **Plan** (touched surface, acceptance criteria), a **Tasks** checklist, **Decisions**
(anything non-obvious you chose and why), and a **Log** (a few dated bullet lines — framed, built,
verified, closed; just enough to resume cold).

**Commit scope.** `features/<slug>/` is feature state, committed on its own. The **flow definition**
(`.claude/`, `scripts/`) is edited directly when it needs to change — just edit the file and say why.

---

## AI log

The assessment requires a real prompt log. `docs/ai-log.md` is updated **as the session happens**
(`CONVENTIONS.md` §11) — not reconstructed at the end, never fabricated.

---

## When something's uncertain

Any skill or agent that hits a genuinely low-confidence decision — no precedent in the codebase, an
ambiguous requirement, a spec gap — **stops and asks**, rather than guessing. Note it under
`## Decisions` in the feature file so the answer is written down once.

Security-relevant ambiguity (who may read/write what, what status code a denial returns) is
**always** escalated — `knowledge/decisions/tenancy-authorization.md` is the reference.

---

## Merging

One person, so `gh pr review --approve` always fails (GitHub rejects self-approval) — don't try it.
Your explicit "merge it" *is* the approval. **Merge commit, never squash** (`gh pr merge <n> --merge`)
— every commit on the feature branch stays visible in `main`'s history. Delete the branch after.

**Deploys.** Vercel's Git integration builds a **preview** for every pushed branch (build runs
`prisma migrate deploy` against the Neon preview DB). The submitted preview is the one built from
the submitted commit SHA — record both (`docs/build-spec.md` §9).
