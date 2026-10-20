# AI log

Kept **during** the timed session (see `.claude/CONVENTIONS.md` §11 and
[`build-spec.md`](build-spec.md) §9). Real entries only — never fabricated. Secrets, cookies
and connection strings redacted as `[REDACTED]`.

Tool: Claude Code (`<model id>`).

## 1. Initial prompt

```text
<verbatim>
```

## 2. Follow-up prompts

### 2.1 <short title>

**Prompt:**

```text
<verbatim>
```

**Relevant response / diff:**

```diff
<excerpt>
```

### 2.2 <short title>

…

## 3. Corrections and rejected suggestions

<!-- Either real entries (what was suggested, why it was wrong/rejected, what was done instead),
     or the sentence: "None occurred." -->

## 4. Checks I performed personally

- [ ] Signed in as Ada and tried to open Globex's project (UI and API) — result:
- [ ] Signed in as Vic and attempted a write via the API — result:
- [ ] Inspected `AuditEntry` rows in Postgres after a create and a rename — result:
- [ ] Read the migration SQL (constraints, indexes) — notes:
- [ ] Ran the test suites myself — output pasted in README
