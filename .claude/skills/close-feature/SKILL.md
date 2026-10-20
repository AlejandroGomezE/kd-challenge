---
name: close-feature
description: Use for the Close phase of this repo's feature flow — after /review-feature (Verify) approved. Writes tests for the touched surface, opens the PR, runs a review-pr pass, merges with explicit human authorization. Triggers on "close the feature", "ship it", or /close-feature <slug>.
argument-hint: <slug>
---

# Close: $ARGUMENTS

You are running **Close** (`WORKFLOW.md`) — the single close phase: tests for what actually changed,
one PR, a review pass, merge on Alejandro's word.

Read `WORKFLOW.md` and `CONVENTIONS.md` first. Write artifacts in English; talk to Alejandro in his
language.

---

## Step 1. Load context

`Read` `features/<slug>/feature.md`. If Verify hasn't approved (no `next: /close-feature <slug>`),
tell Alejandro to finish `/review-feature <slug>` first.

## Step 2. Tests for the touched surface

Not a full coverage sweep — just what this change actually touched:

- **Server** — a unit test for the changed service/logic in a `__tests__/` folder next to it,
  repository mocked (no real DB in a unit test). The **integration authorization matrix**
  (`tests/integration/`, `docs/build-spec.md` §7.1) must cover every endpoint the change touches:
  401 / cross-tenant 404 / viewer 403 / invalid 400 / success with exact audit assertions, plus
  the atomicity case for writes. Real handlers, real Better Auth sign-in, real `tenantdesk_test` —
  never mocked.
- **Client** — a `*.test.tsx` in a `__tests__/` folder next to each changed page/component/hook,
  React Testing Library + MSW (never mock `api-client`/`fetch`). Cover the states the change has
  (pending / empty / validation / failure / success; viewer sees no write controls).
- **E2E** (if the slice is above the cut line or time allows) — Playwright in `e2e/`.

Then from the repo root: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run test:integration`, `npm run build` (and `npm run test:e2e` if e2e exists).

Run them until green — "N files / M tests", not a bare number. Keep the **exact commands and their
output summary**: they go into the PR body and the README's test section (`docs/build-spec.md` §9).

## Step 3. Commit and open the PR

Pick the commit type from what the diff actually does (`CONVENTIONS.md` §9) — usually `feat` or
`fix`; `refactor`/`test`/`docs`/`style` only when that's genuinely all it is. The PR title follows
the same format.

```bash
git add <changed files>            # never .env* or anything with a secret
git commit -m "<type>(<slug>): <summary>"
git push origin <branch>
gh pr create --base main --title "<type>(<slug>): <summary>" \
  --body "<what changed · acceptance criteria met · test results>"
```

Record the PR URL under a `## PRs` line in `feature.md` (add the section if it's not there).

## Step 4. Light review pass

Run `/review-pr` over this PR (or the checklist inline — see that skill). Report findings by
severity. **Alejandro decides**: ready to merge, or changes needed.

- **Changes needed** → post the blockers as one PR comment, keep working via `/implement <slug>`,
  come back here.
- **Ready** → Step 5.

## Step 5. Merge

On explicit "merge it":

```bash
gh pr merge <n> --merge --delete-branch
```

Don't try `gh pr review --approve` first — solo repo, GitHub always rejects self-approval
(`WORKFLOW.md`). Alejandro's "merge it" already is the approval.

If it errors, check `gh pr view <n> --json state` before assuming it failed — a local sync failure
after a real GitHub-side merge shows as `MERGED` there.

Vercel builds a preview from every pushed branch (`WORKFLOW.md` → Merging). After merging, check the
preview for the merged commit built (`vercel ls` or the dashboard) and note its URL + commit SHA in
`feature.md`. A failed build is recorded with its log excerpt — never hidden.

## Step 6. Close the record

1. Tick any `## Follow-ups` items this closed, or leave them as open items — never silently drop one.
2. Set `status: done`, `next: —` in `feature.md`.
3. Add `## Log`: `- <date> · closed — PR #<n>, merged`.
4. Commit `features/<slug>/` (+ `docs/ai-log.md`) only as `chore(<slug>): closed` (`CONVENTIONS.md` §9), push.
5. Update `docs/ai-log.md` with anything real from this phase (`CONVENTIONS.md` §11).
6. Run `scripts/down` (and `scripts/down <port>` for any Playwright port) — always, even if you
   don't think anything is running — and confirm the ports are free (`CONVENTIONS.md` §10). Report anything they couldn't
   stop.

Tell Alejandro it's done. Stop.

---

## Rules

- **Test the touched surface, not everything.**
- **Leave nothing running.** A closed feature ends with `scripts/down`.
- **One PR, Alejandro decides the merge.** Always a merge commit (`--merge`) — never `--squash` or
  `--rebase`; the feature's full commit history stays in `main`.
- **Never `gh pr review --approve`** on this solo repo.
- Follow-ups get resolved or explicitly carried forward — never silently forgotten.
