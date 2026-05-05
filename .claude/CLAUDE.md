# CLAUDE.md — Orchestration Rules

This file tells the **main session** how to coordinate the subagents in this project. The main session does NOT write code, review code, run tests, or update wikis directly — it delegates to the right specialist.

---

## The agent roster

### Standard pipeline (run on every regular feature)

| Agent | Model | Tools | Job |
|---|---|---|---|
| `NESTJS-CODER` | sonnet | full | writes code AND tests |
| `NESTJS-REVIEWER` | sonnet | read-only | JSON verdict (condensed checklist) |
| `NESTJS-TESTER` | haiku | bash whitelisted | runs tests (verification ladder) |
| `CONTEXT-CURATOR` | haiku | writes confined to `.claude/context/` | updates wikis |

### Specialist agents (invoked deliberately, never automatically)

| Agent | Model | Invoked when | Cost class |
|---|---|---|---|
| `MASTER` | opus | Hard problems, design decisions, ambiguous specs, stalled standard pipeline | High — use sparingly |
| `AUDITOR` | opus | End-to-end codebase audit (`/AUDIT` command) | Highest — but Phase 1 now delegates to sonnet reviewer |

The model split is deliberate: high-judgment work runs on `sonnet` or `opus`; mechanical work runs on `haiku`.

### Repowise MCP (optional but recommended)

If Repowise is indexed for this project (`.repowise/` directory exists), the following MCP tools are available to the main session and to agents:

| Tool | Use |
|---|---|
| `get_overview()` | Architecture summary, tech stack, hotspots |
| `get_context(targets)` | Rich documentation + symbols for specific files/modules |
| `get_risk(targets)` | Modification risk assessment (churn, dependents, bus factor) |
| `get_answer(question)` | RAG-powered codebase Q&A with citations |
| `search_codebase(query)` | Semantic search across wiki pages |
| `get_why(query)` | Architectural decisions + intent from git archaeology |
| `get_dead_code()` | Unreachable files/symbols with confidence scores |

Repowise wikis are generated using the configured LLM provider (supports OpenRouter for cheap models). They complement the `.claude/context/` wikis maintained by the CONTEXT-CURATOR.

---

## Slash commands available

| Command | Triggers | Notes |
|---|---|---|
| `/QUICK <task>` (or prefix `quick: <task>`) | Fast-path flow — coder + typecheck gate + conditional escalation | For small changes only |
| `/MASTER <task>` | Invokes MASTER | For tough cases the standard pipeline can't handle |
| `/AUDIT [scope]` | Full end-to-end audit with reports | Phases 0-6, Phase 1 now delegates to sonnet reviewer |

---

## Risk-based routing

Every user prompt gets a `<risk_tier>` tag injected by the `CLASSIFY-RISK.py` hook (keyword heuristics, zero LLM cost). The main session reads this tier and routes accordingly:

| Risk Tier | Description | Flow |
|---|---|---|
| **Tier 1** (Trivial) | Rename, typo, comment, config, import reorder | Auto-route to `/QUICK` flow |
| **Tier 2** (Contained) | Bug fix, DTO field, guard tweak, single-service change | Standard pipeline; skip curator unless public API changed |
| **Tier 3** (Cross-cutting) | New module, new endpoint, transaction logic, dependency addition | Full pipeline with all steps |

If Repowise MCP is available, you can call `get_risk()` on the affected files for a more accurate classification — but the keyword heuristic is the fast baseline.

---

## The standard flow (default for any "implement X" prompt)

```
User prompt
  ↓ CLASSIFY-RISK.py hook: injects <risk_tier> tag
  ↓ ENRICH-PROMPT.py hook: injects relevant context wikis + dependency wikis
Main session (you)
  ↓ Read risk tier. Route Tier 1 to /QUICK.
  ↓ Build context passport (see below).
  ↓ delegate: "Use NESTJS-CODER to implement <task>"
NESTJS-CODER
  ↓ returns: file list + summary + tests added
Main session
  ↓ TYPECHECK GATE: run `npx tsc --noEmit --pretty 2>&1 | head -30`
  ↓ LINT GATE: run `npx eslint --quiet <changed-files> 2>&1 | head -20`
  ↓ if errors: return to CODER (does NOT count toward reviewer loop budget)
  ↓ if clean: build explicit file list from coder output
  ↓ delegate: "Use NESTJS-REVIEWER to review files: [explicit list]"
NESTJS-REVIEWER
  ↓ returns JSON: { verdict, issues[], summary }
  ↓ if rejected: loop back to NESTJS-CODER with the issues array
  ↓ if approved: continue
Main session
  ↓ delegate: "Use NESTJS-TESTER to run tests for <scope> at <risk tier>"
NESTJS-TESTER (verification ladder — depth matches risk tier)
  ↓ returns JSON: { passed, summary, failures[] }
  ↓ if failed: loop back to NESTJS-CODER with the failures array
  ↓ if passed: continue
Main session
  ↓ if public API changed: delegate wiki update
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

- **Static review is cheap** (sonnet read-only, no spinning up DB/sandbox).
- **Tests are expensive** (DB, network, time).
- **Reject early, reject cheap.** No point running tests on code that has structural blockers.
- **Typecheck/lint gates are free** (~2 second bash calls). They catch ~30% of what the reviewer would catch, saving a reviewer round-trip.

---

## Context passport pattern

The main session maintains a compact summary that travels with the task through the pipeline. This eliminates redundant file reads across agents.

After the coder returns, build the passport:

```markdown
## Context Passport
**Risk tier**: <1|2|3>
**Changed files**:
- <file path> (<new|modified>, ~N lines)

**Dependencies to check**:
- <file path> (unchanged, for layering/contract check)

**Coder summary**: <paste the coder's structured summary verbatim>

**Test command**: <specific jest command for the scope>

**Wiki update needed**: <yes/no> (based on whether public API changed)
```

Pass the relevant portions to each downstream agent:
- **Reviewer** gets: changed files, dependencies, coder summary
- **Tester** gets: risk tier, test command
- **Curator** gets: coder summary (wiki ingredients section)

---

## How to delegate (Synthesis Mandate)

Subagents are invoked with the form Claude Code recognizes: `Use the <agent-name> subagent to ...`. **Every delegation must prove the main session understood the upstream output.** Pass:

1. **The task** — clear, single-paragraph description.
2. **Explicit file list** — extracted from the coder's output. NEVER say "find them via Glob." The coder already listed them.
3. **Constraints from earlier steps** — for the second coder loop, paste the reviewer's `issues[]` array verbatim.
4. **Acceptance criteria** — what does "done" look like?

Example handoff to reviewer after coder completes:

> Use the NESTJS-REVIEWER subagent to review these files:
>
> Changed:
> - `src/modules/users/users.service.ts` (modified)
> - `src/modules/users/users.service.spec.ts` (new)
>
> Dependencies to also read:
> - `src/modules/users/users.controller.ts` (for layering check)
> - `src/modules/users/dto/create-user.dto.ts` (for contract check)
>
> Coder summary: "Added createUser method with validation, repository injection, and DTO projection. Tests cover happy path + duplicate email (409)."

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

**Never delegate with vague context.** Phrases like "based on what you discovered" or "review the changes" without file lists waste tokens — the downstream agent will Glob/Grep to rediscover what you already know.

---

## The fast path (`/QUICK` or `quick:` prefix)

For small changes — renames, parameter tweaks, signature adjustments, comment updates. See `.claude/commands/QUICK.md` for the full flow.

Short version:

```
1. NESTJS-CODER makes the change (no new tests unless a new code path was created)
1.5. TYPECHECK + LINT GATE (main session runs directly, no subagent)
     - tsc --noEmit + eslint --quiet
     - if errors: return to coder (free, doesn't count toward loop budget)
2. NESTJS-REVIEWER judges with two extra fields:
   - recommend_full_pipeline: bool
   - recommend_tests: bool
3. Branch on reviewer's recommendation:
   - full_pipeline → escalate to standard flow
   - just tests → run tester only (Quick Smoke depth)
   - neither → done
4. Curator only invoked if change altered public API surface or made an architectural decision
```

Risk tier auto-routing: if `<risk_tier>1</risk_tier>` is injected and the user did NOT explicitly invoke `/QUICK`, you can auto-route Tier 1 tasks to the Quick flow. Mention this to the user: "This looks like a small change — running the Quick flow."

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

### What changed (v2)

- **Phase 1 now delegates to NESTJS-REVIEWER** (sonnet, audit mode) for module-by-module checklist reviews. The AUDITOR (opus) orchestrates and adds its deep-reasoning findings on top. This saves ~60% on Phase 1 costs.
- **Incremental audits**: If `.claude/audits/baseline.json` exists, the AUDITOR only reviews modules whose files changed since the baseline SHA. Unchanged modules are carried forward.
- **Repowise integration**: If available, the AUDITOR uses `get_overview()` and `get_risk()` for faster analysis.
- **Git hotspot data**: If `.claude/context/git-hotspots.json` exists, the AUDITOR reads it for priority ordering.

### Phase-by-phase responsibilities

| Phase | Owner | What happens |
|---|---|---|
| 0 | Auditor | Setup: audit directory, metadata, read baseline.json if exists |
| 1 | Auditor + **NESTJS-REVIEWER (audit mode)** | Module reviews: AUDITOR requests, main session invokes reviewer, feeds results back |
| 2-3 | Auditor | Cross-cutting concern analysis + plan generation (opus judgment) |
| 4 | Auditor → main session → user | Plan surfaces; user approves/modifies; main session saves `plan-approved.md` |
| **5** | **Main session** | **Execute the approved plan item-by-item via the standard pipeline** |
| 6 | Auditor (re-invoked) | Reads execution log, writes three reports, updates `baseline.json` |

### Phase 1 — AUDIT-REVIEW REQUESTS

During Phase 1, the AUDITOR outputs blocks like:
```
## AUDIT-REVIEW REQUEST
**Module**: users
**Path**: src/modules/users/
**Files**: [list]
**Mode**: audit
```

When you see these, invoke NESTJS-REVIEWER with `mode: audit` and the listed files. Feed the reviewer's expanded JSON (with `cross_module_concerns` and `test_coverage_gaps`) back to the AUDITOR.

### Phase 5 — what you do as main session

After the AUDITOR returns control with `plan-approved.md`:

1. **Read `plan-approved.md`** at `.claude/audits/<ts>/plan-approved.md`.

2. **For each item, in priority order (P0 → P1 → P2)**, run the standard pipeline (including typecheck/lint gates and risk-proportional test depth).

3. **After each item completes**, append to `.claude/audits/<ts>/execution-log.md`:
   ```markdown
   ## <plan item title> — <ISO timestamp>
   - Coder: <files changed, one-line summary>
   - Review: <verdict, rounds taken>
   - Tests: <pass/fail, rounds taken>
   - Wiki: <updated paths or "skipped">
   ```

4. **After ALL items are done**, re-invoke the AUDITOR for Phase 6 reports.

### Phase 5 — what NOT to do

- **Do not invoke the AUDITOR during Phase 5.** Its job is done until Phase 6.
- **Do not skip the reviewer pass on any item.** The independent reviewer gate is the point.
- **Do not mix Phase 5 items.** Run them sequentially. Plan items often have dependencies.

---

## Loop budgets (apply to standard flow and audit execution)

To prevent infinite review loops:

- **Max 3 coder→reviewer round-trips per task.** After 3, escalate to the user.
- **Max 2 coder→tester round-trips per task.** After 2, surface to the user.

Inside the audit's Phase 5, the same budgets apply per-plan-item.

---

## When to skip steps

| Task type | Coder | Typecheck Gate | Reviewer | Tester | Curator |
|---|---|---|---|---|---|
| New feature (Tier 3) | ✅ | ✅ | ✅ | ✅ (Deep) | ✅ |
| Bug fix (Tier 2) | ✅ | ✅ | ✅ | ✅ (Targeted) | ❓ skip if behaviour unchanged at module-API level |
| Refactor (Tier 2) | ✅ | ✅ | ✅ | ✅ (Targeted) | ❌ |
| Trivial change (Tier 1) | ✅ | ✅ | ✅ (with extras) | conditional (Quick Smoke) | conditional |
| Doc-only change | ✅ | ❌ | ❌ | ❌ | ❌ |
| Test-only addition | ✅ | ✅ | ✅ | ✅ (Targeted) | ❌ |
| Config / dependency bump | ✅ | ✅ | ✅ | ✅ (Deep) | ❌ |
| Wiki update only | ❌ | ❌ | ✅ | ❌ | ✅ |
| `/MASTER` task | varies | varies | varies | varies | varies |
| `/AUDIT` | full pipeline per item | yes | yes (audit mode for Phase 1) | yes | per item |

---

## What the main session itself does

- **Reads risk tier** from `<risk_tier>` tag and routes accordingly.
- **Builds context passport** after coder completes — explicit file lists, test commands, wiki update flags.
- **Runs typecheck/lint gates** directly (bash, no subagent) before invoking reviewer.
- **Passes explicit file lists** to every downstream agent (Synthesis Mandate).
- **Tracks loop counts.** Enforce the budget.
- **Bridges human gates.** Auditor's Phase 4, MASTER's delegation requests.
- **Aggregates the final report.** What shipped, what tests passed, what wikis updated.

Do NOT:
- Edit source files yourself when a coder is available.
- Approve code yourself when a reviewer is available.
- Run tests yourself when a tester is available.
- Update wikis yourself when a curator is available.
- Auto-approve MASTER delegation requests or AUDITOR plans.
- Delegate with vague context (no "find them via Glob" — always pass explicit file lists).

---

## Hook reminders

The `.claude/settings.json` defines hooks that fire automatically:

- `SessionStart` — orientation (NestJS version, branch, available subagents, Repowise status, hotspot data)
- `UserPromptSubmit: CLASSIFY-RISK.py` — risk tier classification (keyword heuristics, zero LLM cost)
- `UserPromptSubmit: ENRICH-PROMPT.py` — context wiki injection (direct match + dependency match)
- `PreToolUse: Write|Edit|MultiEdit` — blocks writes to `.env`, `.git/`, lockfiles, etc.
- `PreToolUse: Bash` — blocks tester subagent from running non-test commands
- `PreToolUse: Write|Edit|MultiEdit` — blocks curator from writing outside `.claude/context/`
- `PostToolUse: Write|Edit|MultiEdit` — runs prettier + eslint --fix on edited TS files

You don't invoke these. They run on their own. The AUDITOR writes to `.claude/audits/<timestamp>/` — this path is NOT blocked.

---

## On context

Three context sources work together:

1. **ENRICH-PROMPT hook** (zero LLM cost): Injects `.claude/context/` wikis based on keyword match + dependency walking. Happens automatically before every prompt.

2. **Repowise MCP** (if available): Rich codebase intelligence — symbol-level docs, PageRank-based importance, git-informed risk, semantic search. Call `get_context()` or `get_risk()` when you need deeper context than the wikis provide.

3. **CONTEXT-CURATOR** wikis (`.claude/context/modules/*.md`): Long-term memory maintained by the curator after features ship. The ENRICH-PROMPT hook injects these automatically.

The wikis are the baseline (always available). Repowise is the upgrade (richer, but requires setup). The curator keeps wikis fresh after changes land; Repowise's `watch` or `update` commands keep its index fresh.
