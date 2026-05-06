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

### Step 1.5 — Typecheck + lint gate (main session runs directly, no subagent)

Before invoking the reviewer, run these free gates yourself:

```bash
docker compose exec <service> npx tsc --noEmit --pretty 2>&1 | head -30
docker compose exec <service> npx eslint --quiet <changed-files> 2>&1 | head -20
```

Where `<service>` is `api` for NestJS code or `web` for Next.js code. If containers aren't running: `docker compose up -d api web postgres redis && sleep 5`.

- If **type errors**: send them back to NESTJS-CODER with the error output. This does NOT count toward the reviewer loop budget. The coder fixes type errors faster and cheaper than the reviewer finding them.
- If **lint errors** (only `error` severity, not warnings): same — send back to coder.
- If both clean: proceed to reviewer.

This prevents ~30% of reviewer rejections on Quick flow changes, since type errors and lint violations are the most common issues.

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

### Step 5 — Repowise sync (if indexed)

If `.repowise/` exists, run:

```bash
repowise update --dry-run 2>&1
```

If files are stale:

```bash
repowise update 2>&1
```

Include the output in your final report. If the update fails, report the failure but don't block — the CONTEXT-CURATOR wikis are still valid.

## Final report to user

Keep it tight:
```
✓ Changed: <file list>
✓ Reviewed: <verdict>
<✓ or skipped>: Tests
<✓ or skipped>: Wiki update
<✓ synced N pages / skipped / failed>: Repowise
```

## When NOT to honor `/QUICK`

If the user's request is clearly NOT small (e.g. "/QUICK add a new payment provider"), surface that:

> "This doesn't look like a quick change — adding a payment provider needs the full pipeline (new module, tests, wiki). Want me to run the standard flow instead?"

Don't silently downgrade a real feature into a fast-path; it skips important steps.
