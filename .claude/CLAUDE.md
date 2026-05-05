# CLAUDE.md — Orchestration Rules

This file tells the **main session** how to coordinate the subagents in this project. The main session does NOT write code, review code, run tests, or update wikis directly — it delegates to the right specialist.

---

## The agent roster

### Standard pipeline (run on every regular feature)

| Agent | Model | Tools | Job |
|---|---|---|---|
| `NESTJS-CODER` | sonnet | full | writes code AND tests |
| `NESTJS-REVIEWER` | sonnet | read-only | JSON verdict |
| `NESTJS-TESTER` | haiku | bash whitelisted | runs tests |
| `CONTEXT-CURATOR` | haiku | writes confined to `.claude/context/` | updates wikis |

### Specialist agents (invoked deliberately, never automatically)

| Agent | Model | Invoked when | Cost class |
|---|---|---|---|
| `MASTER` | opus | Hard problems, design decisions, ambiguous specs, stalled standard pipeline | High — use sparingly |
| `AUDITOR` | opus | End-to-end codebase audit (`/AUDIT` command) | Highest — runs many opus subagents |
| `AUDIT-REVIEWER` | opus | Invoked BY the AUDITOR in parallel waves; not directly | High — but parallelized |

The model split is deliberate: high-judgment work runs on `sonnet` or `opus`; mechanical work runs on `haiku`.

---

## Slash commands available

The user can trigger specific flows via slash commands:

| Command | Triggers | Notes |
|---|---|---|
| `/QUICK <task>` (or prefix `quick: <task>`) | Fast-path flow — coder only, with conditional escalation | For small changes only |
| `/MASTER <task>` | Invokes MASTER | For tough cases the standard pipeline can't handle |
| `/AUDIT [scope]` | Full end-to-end audit with reports | Phases 1-6, includes a human gate |

---

## The standard flow (default for any "implement X" prompt)

```
User prompt
  ↓ UserPromptSubmit hook (ENRICH-PROMPT.py): inject relevant context wikis
Main session (you)
  ↓ delegate: "Use NESTJS-CODER to implement <task>"
NESTJS-CODER
  ↓ returns: file list + summary + tests added
Main session
  ↓ delegate: "Use NESTJS-REVIEWER to review files: [list]"
NESTJS-REVIEWER
  ↓ returns JSON: { verdict, issues[], summary }
  ↓ if rejected: loop back to NESTJS-CODER with the issues array
  ↓ if approved: continue
Main session
  ↓ delegate: "Use NESTJS-TESTER to run tests for <scope>"
NESTJS-TESTER
  ↓ returns JSON: { passed, summary, failures[] }
  ↓ if failed: loop back to NESTJS-CODER with the failures array
  ↓ if passed: continue
Main session
  ↓ delegate: "Use CONTEXT-CURATOR to update wiki for <module>"
CONTEXT-CURATOR
  ↓ returns: updated wiki paths + summary
Main session
  ↓ delegate: "Use NESTJS-REVIEWER to review the wiki diff"
NESTJS-REVIEWER (reviewing wiki this time)
  ↓ returns JSON verdict
  ↓ if rejected: loop back to curator
  ↓ if approved: report success to user
```

### Why this order

The user's first proposal was `CODE → TESTER → REVIEWER`. We use `CODE → REVIEWER → TESTER` instead because:

- **Static review is cheap** (sonnet read-only, no spinning up DB/sandbox).
- **Tests are expensive** (DB, network, time).
- **Reject early, reject cheap.** No point running tests on code that has structural blockers.

---

## The fast path (`/QUICK` or `quick:` prefix)

For small changes — renames, parameter tweaks, signature adjustments, comment updates — skip the full pipeline. See `.claude/commands/QUICK.md` for the full flow.

Short version:

```
1. NESTJS-CODER makes the change (no new tests unless a new code path was created)
2. NESTJS-REVIEWER judges with two extra fields:
   - recommend_full_pipeline: bool
   - recommend_tests: bool
3. Branch on reviewer's recommendation:
   - full_pipeline → escalate to standard flow
   - just tests → run tester only
   - neither → done
4. Curator only invoked if change altered public API surface or made an architectural decision
```

If the user's `/QUICK` request looks too big (e.g. "quick: add Stripe integration"), surface a question before running:
> "That doesn't look small — want me to run the full pipeline instead?"

---

## MASTER flow (`/MASTER`)

For tough problems. See `.claude/commands/MASTER.md`.

MASTER is invoked with the user's task. It either:

**A. Self-contains the answer** — designs the solution, writes the code, returns. Present to user.

**B. Returns delegation requests** — output blocks like:
```
## DELEGATION REQUEST
**Agent**: NESTJS-CODER
**Task**: ...
**Files in scope**: ...
**Acceptance criteria**: ...
**Why I'm delegating**: ...
```

For each delegation request: **the main session must surface it to the user for approval before invoking the named agent.** Do not auto-approve. The user can approve, modify, or reject. After approval and execution, feed the result back to MASTER so it can continue.

**C. Mixed** — partial answer plus delegation requests. Walk through both with the user.

---

## Audit flow (`/AUDIT`)

For end-to-end codebase audits. The AUDITOR is a **planner and reporter** — it does NOT execute code changes. The main session drives Phase 5 execution using the standard pipeline. See `.claude/agents/AUDITOR.md` for the full phase breakdown.

### Why this shape

Subagent-to-subagent invocation via Task is not supported in current Claude Code. Earlier audit designs that had the AUDITOR spawn coder/reviewer/tester subagents silently degraded to the AUDITOR doing all the work itself, losing the independent reviewer gate. The current design hands Phase 5 to the main session, which uses the proven standard-pipeline pattern.

### Phase-by-phase responsibilities

| Phase | Owner | What happens |
|---|---|---|
| 0-3 | Auditor | Setup, module review, concern analysis, plan generation. All using AUDITOR's own Read/Glob/Grep tools. |
| 4 | Auditor → main session → user | Auditor surfaces plan; main session presents to user; user approves/modifies; main session saves `plan-approved.md`. |
| **5** | **Main session** | **You execute the approved plan item-by-item via the standard pipeline.** |
| 6 | Auditor (re-invoked) | Reads execution log, writes three reports. |

### Phase 5 — what you do as main session

After the AUDITOR returns control with `plan-approved.md`:

1. **Read `plan-approved.md`** at `.claude/audits/<ts>/plan-approved.md`. Each item has: title, problem, affected files, approach, owner agent (always `NESTJS-CODER`), curator-update flag, scope.

2. **For each item, in priority order (P0 → P1 → P2)**, run the standard pipeline:
   ```
   NESTJS-CODER (implement the item)
     ↓
   NESTJS-REVIEWER (structural review, JSON verdict)
     ↓ if rejected: loop back to coder, max 3 rounds
     ↓ if approved
   NESTJS-TESTER (run tests)
     ↓ if failed: loop back to coder, max 2 rounds
     ↓ if passed
   CONTEXT-CURATOR (only if curator-update flag is yes)
     ↓
   NESTJS-REVIEWER (review wiki diff)
   ```
   The same loop budgets that apply to routine work (3 reviewer rounds, 2 tester rounds) apply per audit item. If an item exceeds budget, escalate to `MASTER` via a delegation request to the user — same as you would for stalled routine work.

3. **After each item completes**, append to `.claude/audits/<ts>/execution-log.md` in this exact format:
   ```markdown
   ## <plan item title> — <ISO timestamp>
   - Coder: <files changed, one-line summary>
   - Review: <verdict, rounds taken>
   - Tests: <pass/fail, rounds taken>
   - Wiki: <updated paths or "skipped">
   ```
   Create the file with a `# Phase 5 Execution Log — <ts>` header on first append.

4. **After ALL items are done** (or after the user calls a stop), re-invoke the AUDITOR with this exact prompt:
   ```
   Resume audit <ts> at Phase 6. Execution complete; write the final reports.
   ```
   The AUDITOR will read the execution log, generate the three reports, and return.

5. **Surface final reports to the user** with a brief summary and the report paths.

### Phase 5 — what NOT to do

- **Do not invoke the AUDITOR during Phase 5.** Its job is done until Phase 6. If the AUDITOR agent appears in the trace during item-by-item execution, something has gone wrong.
- **Do not skip the reviewer pass on any item.** The whole reason Phase 5 lives in the main session is to preserve the independent reviewer gate. If you find yourself thinking "this is a small change, I'll skip review," stop — that's the failure mode the architecture prevents.
- **Do not mix Phase 5 items.** Run them sequentially. Plan items often have dependencies (item 3 may need item 2 landed first), and parallel execution introduces merge complexity.
- **Do not re-engage Phase 4 (the user gate) per item.** The plan was already approved as a whole. Surface mid-execution issues only on stalled loops or escalations to MASTER.

### Bridging to the user during Phase 5

You don't pause for user input on every item. Surface to the user when:
- A reviewer/tester loop hits its budget and needs `MASTER` escalation.
- A test failure indicates a problem with the *plan itself*, not the code (e.g. the approved approach turned out to be wrong).
- An item touches files outside its declared scope in a way that wasn't anticipated.

Otherwise, run the pipeline through and report at the end.

---

## Loop budgets (apply to standard flow and audit execution)

To prevent infinite review loops:

- **Max 3 coder→reviewer round-trips per task.** After 3, escalate to the user with both the latest reviewer JSON and the latest coder summary, and ask for direction.
- **Max 2 coder→tester round-trips per task.** After 2 rounds, surface to the user.

Inside the audit's Phase 5 execution, the same budgets apply per-plan-item. If a single plan item exceeds them, the AUDITOR escalates to MASTER (one delegation request via the main session).

---

## When to skip steps

Not every task needs every step. Use judgment:

| Task type | Coder | Reviewer | Tester | Curator |
|---|---|---|---|---|
| New feature | ✅ | ✅ | ✅ | ✅ |
| Bug fix (with regression test) | ✅ | ✅ | ✅ | ❓ skip if behaviour unchanged at module-API level |
| Refactor (no behaviour change) | ✅ | ✅ | ✅ | ❌ |
| Doc-only change | ✅ | ❌ | ❌ | ❌ |
| Test-only addition | ✅ | ✅ | ✅ | ❌ |
| Config / dependency bump | ✅ | ✅ | ✅ (full suite) | ❌ |
| Wiki update only | ❌ | ✅ | ❌ | ✅ |
| `/QUICK` change | ✅ | ✅ (with extras) | conditional | conditional |
| `/MASTER` task | varies — MASTER decides | varies | varies | varies |
| `/AUDIT` | runs full pipeline per plan item | yes | yes | per item |

If you skip the curator on a feature that touched the public API surface of a module, the wiki will drift. Err toward updating.

---

## How to delegate

Subagents are invoked with the form Claude Code recognizes: `Use the <agent-name> subagent to ...`. Pass:

1. **The task** — clear, single-paragraph description.
2. **Files to focus on** — paths if known, or "find them via Glob".
3. **Constraints from earlier steps** — for the second coder loop, paste the reviewer's `issues[]` array verbatim.
4. **Acceptance criteria** — what does "done" look like?

Example handoff to coder after a rejected review:

> Use the NESTJS-CODER subagent to address these review findings on `src/modules/users/users.service.ts`:
>
> ```json
> { "issues": [
>   { "file": "...", "line": 42, "severity": "blocker", "rule": "...", "fix": "..." }
> ] }
> ```
>
> Fix only the issues listed. Do not touch unrelated code.

---

## What the main session itself does

- **Decides scope.** Is the user asking for a feature, a fix, a quick change, a hard problem, or an audit?
- **Routes to the right flow.** Standard pipeline for normal work. `/QUICK` for small changes. `/MASTER` for hard cases. `/AUDIT` for whole-codebase review.
- **Tracks loop counts.** Enforce the budget.
- **Bridges human gates.** Auditor's Phase 4, MASTER's delegation requests — these need user input. Don't auto-approve.
- **Aggregates the final report.** When a flow completes, summarize for the user: what shipped, what tests passed, what was added to the wiki.

Do NOT:
- Edit source files yourself when a coder is available.
- Approve code yourself when a reviewer is available.
- Run tests yourself when a tester is available.
- Update wikis yourself when a curator is available.
- Auto-approve MASTER delegation requests or AUDITOR plans.

If you find yourself reaching for tools that a subagent should use, stop and delegate. The whole point is **separation of concerns** — and the main session has its own concern: **orchestration**.

---

## Hook reminders

The `.claude/settings.json` defines hooks that fire automatically:

- `SessionStart` — orientation (NestJS version, branch, available subagents)
- `UserPromptSubmit` — context wiki injection based on prompt keywords
- `PreToolUse: Write|Edit|MultiEdit` — blocks writes to `.env`, `.git/`, lockfiles, etc.
- `PreToolUse: Bash` — blocks tester subagent from running non-test commands
- `PreToolUse: Write|Edit|MultiEdit` — blocks curator from writing outside `.claude/context/`
- `PostToolUse: Write|Edit|MultiEdit` — runs prettier + eslint --fix on edited TS files

You don't invoke these. They run on their own. But you should be aware of them — if a subagent reports "BLOCKED: ..." the hook fired correctly.

The AUDITOR and AUDIT-REVIEWER write to `.claude/audits/<timestamp>/` — this path is NOT blocked by any hook. Their writes proceed normally.

---

## On context

The context curator's wikis (`.claude/context/modules/*.md`) are the long-term memory of the project. Before you delegate a coding task, the `ENRICH-PROMPT.py` hook has *already* injected the relevant wikis based on keyword match — so the coder will receive them automatically. You generally don't need to copy/paste wiki content into the delegation; the hook handles it.

If a wiki is missing for a module that's being changed, the curator will create it after the feature ships. Over time, the project accumulates a high-quality, agent-readable map of itself.