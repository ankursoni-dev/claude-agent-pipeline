---
description: Fast-path flow for small changes (renames, param tweaks, small refactors). Skips the full pipeline — coder makes the change, reviewer judges if tests/full pipeline are needed.
---

# Quick command

The user has invoked `/QUICK` (or prefixed their prompt with `quick:`). Their change request: `$ARGUMENTS`

Run the **fast-path flow**. Do NOT run the standard coder → reviewer → tester → curator pipeline.

## Fast-path flow

### Step 1 — Coder makes the change

Invoke `NESTJS-CODER` with:
- The user's request
- A note that this is a `/QUICK` invocation: the change is expected to be small (rename, parameter change, signature tweak, comment update, etc.)
- Instruction: **do not write new tests** unless the change introduces a new code path that needs coverage. If existing tests need their assertions updated to match a rename, do that. Otherwise, leave tests alone.

### Step 2 — Reviewer judges scope

Invoke `NESTJS-REVIEWER` with:
- The list of files the coder changed
- A note that this is a `/QUICK` invocation, and the reviewer must include two extra fields in their JSON output:
  - `recommend_full_pipeline`: bool — does this change actually warrant the full pipeline? (true if the change is bigger than the user thought, or touches behavior that needs test coverage)
  - `recommend_tests`: bool — should we run the tester even though we're in fast-path?

The reviewer's normal verdict still applies. If `verdict: rejected`, loop back to coder once.

### Step 3 — Branch on reviewer's recommendation

| Reviewer says | Action |
|---|---|
| `recommend_full_pipeline: true` | Tell the user: "The change is larger than expected — escalating to the full pipeline." Then run the standard flow from Step 2 (review onwards) using the existing reviewer verdict. |
| `recommend_tests: true` (and full pipeline false) | Invoke `NESTJS-TESTER`. If tests fail, loop back to coder. |
| Both false, verdict approved | Done. Skip tester. |

### Step 4 — Curator only if structural

If the change altered:
- A module's public API surface (new export, removed export, signature change on an exported function)
- A cross-cutting decision (new transaction strategy, new auth mechanism)
- A documented architectural choice in `.claude/context/`

then invoke `CONTEXT-CURATOR` to update the wiki. Otherwise skip — the wiki need not reflect every rename.

## Final report to user

Keep it tight:
```
✓ Changed: <file list>
✓ Reviewed: <verdict>
<✓ or skipped>: Tests
<✓ or skipped>: Wiki update
```

## When NOT to honor `/QUICK`

If the user's request is clearly NOT small (e.g. "/QUICK add a new payment provider"), surface that:

> "This doesn't look like a quick change — adding a payment provider needs the full pipeline (new module, tests, wiki). Want me to run the standard flow instead?"

Don't silently downgrade a real feature into a fast-path; it skips important steps.
