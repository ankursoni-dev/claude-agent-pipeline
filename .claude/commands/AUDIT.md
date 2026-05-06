---
description: Run a full code audit. Auditor plans, you (main session) execute, AUDITOR writes reports. Includes a human gate before any code changes. Expensive; opus-powered.
---

# Audit command

The user has invoked `/AUDIT`. Their additional arguments (if any): `$ARGUMENTS`

## The flow you orchestrate

This is a three-stage interaction. You (main session) are the bridge.

```
Stage A — AUDITOR invocation (Phases 0-4)
  ↓ AUDITOR returns plan, awaiting approval
Stage B — you ↔ user gate
  ↓ user approves; you save plan-approved.md
Stage C — you (main session) execute Phase 5 per CLAUDE.md
  ↓ all items complete; execution-log.md populated
Stage D — AUDITOR re-invocation (Phase 6)
  ↓ AUDITOR writes reports; you surface to user
```

## Stage A — invoke the AUDITOR for planning

Invoke the `AUDITOR` subagent. Pass it:

1. Any user-provided focus from `$ARGUMENTS` (e.g. "/AUDIT security only" → focus on security concerns; "/AUDIT module:users" → audit just that module). If no arguments, do a full repo audit.

2. The current git SHA and branch (or note "not a git repo" if absent), so audit-meta is accurate.

3. A reminder that the AUDITOR must STOP at Phase 4 (the human gate) and surface the plan for approval. The AUDITOR will not execute code changes — that's your job in Stage C.

4. **If Repowise MCP is available**: Tell the AUDITOR it can use `get_overview()`, `get_risk()`, and `get_context()` for faster module analysis.

5. **If `.claude/context/git-hotspots.json` exists**: Tell the AUDITOR to read it for priority ordering.

6. **If `.claude/audits/baseline.json` exists**: Tell the AUDITOR to use incremental mode — only review modules whose files changed since the baseline SHA. Unchanged modules are carried forward.

The AUDITOR will run Phases 0-3 (setup, module review, concern analysis, plan generation) and then surface the plan to you for human approval.

**Phase 1 change**: The AUDITOR now delegates module-by-module reviews to NESTJS-REVIEWER in audit mode (sonnet) instead of doing them all itself (opus). The AUDITOR will output `## AUDIT-REVIEW REQUEST` blocks that you must execute by invoking NESTJS-REVIEWER with `mode: audit` and feeding the results back to the AUDITOR. This saves ~60% of Phase 1 costs.

## Stage B — present the plan, gate on approval

When the AUDITOR surfaces the plan:

1. Read it cleanly to the user. Lead with the executive summary and findings dashboard. Inline the top 3 risks. Then list the prioritized plan items (P0/P1/P2). End with the approval prompt the AUDITOR provided.

2. Wait for the user's response. Common shapes:
   - `approve` → all items proceed
   - `approve P1 only` → defer P2
   - `approve P1 except 2` → defer specific items
   - `modify: <changes>` → relay to the AUDITOR for revision (re-invoke AUDITOR with the modification, get a revised plan, return to step 1)
   - `defer all` → write plan-approved.md as documentation only, skip Stage C, jump to Stage D with execution-log noting "no items executed; findings documented only"

3. **Once approved, save the approved plan yourself** at `.claude/audits/<ts>/plan-approved.md`. The approved plan should be the original plan with deferred items marked `[DEFERRED — user request]` rather than removed (preserves the audit record). Use Write directly; do not re-invoke the AUDITOR for this.

## Stage C — execute Phase 5 (you, main session)

Per `CLAUDE.md`'s "Audit flow → Phase 5" section. Summary:

For each item in `plan-approved.md`, in priority order (P0 → P1 → P2):

1. Invoke `NESTJS-CODER` with the item's problem + approach + affected files.
2. Invoke `NESTJS-REVIEWER` with the changed file list. If rejected, loop back to coder (max 3 rounds).
3. Invoke `NESTJS-TESTER` for the relevant scope. If failed, loop back to coder (max 2 rounds).
4. If the item's `Curator update needed?` flag is yes, invoke `CONTEXT-CURATOR` and then `NESTJS-REVIEWER` on the wiki diff.
5. Append to `.claude/audits/<ts>/execution-log.md` after each item, using the format spelled out in CLAUDE.md.

Don't pause for user input mid-stream unless:
- A loop hits its budget (escalate to MASTER via a delegation request)
- A test failure reveals the plan itself was wrong (surface for re-planning)
- Scope creep — an item touches unanticipated files

When all items are done:

1. **Repowise sync** (if `.repowise/` exists): Run `repowise update 2>&1` once — this covers all files changed across all plan items. Include the sync output in `execution-log.md`:
   ```markdown
   ## Repowise sync — <ISO timestamp>
   - Pages regenerated: <list from repowise update output>
   - Status: <success / failed: reason>
   ```
2. Move to Stage D.

## Stage D — re-invoke the AUDITOR for reports

Invoke the AUDITOR with the exact prompt:

```
Resume audit <ts> at Phase 6. Execution complete; write the final reports.
```

The AUDITOR will read `plan-approved.md` and `execution-log.md`, sample changed files, and generate `security.md`, `code.md`, and `architecture.md` under `.claude/audits/<ts>/reports/`.

When the AUDITOR returns:

1. Surface the report paths to the user.
2. Quote the executive summary or top findings inline so the user has context without opening files.
3. Offer to walk through any specific report.

## Reminders

- The AUDITOR does not have the `Task` tool — it cannot invoke other subagents. This is by design (Option A architecture).
- During Phase 5, you are the orchestrator. The AUDITOR is dormant. Don't loop back to the AUDITOR for "another opinion" mid-execution — that's not its role here.
- If the user wants to abort mid-Phase-5, that's fine: write what's in execution-log so far, then jump to Stage D with the partial log. The AUDITOR will report on what shipped.
- If the AUDITOR surfaces a request for access to a tool that isn't connected (e.g. database MCP), surface that to the user before continuing.