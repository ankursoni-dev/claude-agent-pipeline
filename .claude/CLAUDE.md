# CLAUDE.md — Orchestration Rules

This file tells the **main session** how to coordinate the subagents in this project. The main session does NOT write code, review code, run tests, or update wikis directly — it delegates to the right specialist.

---

## Monorepo awareness

This pipeline supports monorepo projects with multiple frameworks. The coder and reviewer auto-detect the framework from file paths:

| Path pattern | Framework | Skill set |
|---|---|---|
| `apps/api/`, `src/modules/` | NestJS | `nestjs` (LLD.md, API-DESIGN.md, CLI.md) |
| `apps/web/`, `src/app/`, `src/components/` | Next.js | `nextjs` (LLD.md, COMPONENT-DESIGN.md) |
| `packages/` | Shared | TypeScript best practices |

When delegating to the coder, include which part of the monorepo the task targets. For cross-stack tasks (e.g., "add a users page that calls the users API"), split into separate delegations or let the coder handle both in sequence.

### Typecheck/lint gates in monorepo (run inside Docker)

For NestJS code: `docker compose exec api npx tsc --noEmit --pretty 2>&1 | head -30`
For Next.js code: `docker compose exec web npx tsc --noEmit --pretty 2>&1 | head -30`
For shared packages: `docker compose exec api npx tsc --noEmit -p packages/<name>/tsconfig.json`
For lint: `docker compose exec <service> npx eslint --quiet <changed-files> 2>&1 | head -20`

If containers are not running: `docker compose up -d api web postgres redis && sleep 5` before running gates.

---

## Project-wide standards — enforced at every pipeline step

These three standards are **non-negotiable** across all agents. The main session enforces them as gates; the coder must produce compliant code; the reviewer must check for compliance; the tester must verify.

### 1. Prettier formatting

A `.prettierrc` exists at the monorepo root. All TypeScript/TSX code MUST be prettier-formatted.

- **Coder**: Run `npx prettier --check <changed-files>` before returning. If it fails, fix it.
- **Reviewer**: Flag unformatted code as `minor` severity (it should never reach you — the AUTO-FORMAT hook runs post-edit — but catch it if it does).
- **Tester**: Not responsible for formatting checks.
- **Main session gate**: The AUTO-FORMAT.sh PostToolUse hook runs prettier + eslint --fix automatically after every file edit. If the coder's output is still not formatted, send it back before invoking the reviewer.
- **Settings**: `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`, `semi: true`, `tabWidth: 2`.

### 2. OpenAPI / Swagger documentation

Every NestJS API endpoint MUST be documented with Swagger decorators. The API docs are served at `/api/docs` via `@nestjs/swagger`.

- **Coder (NestJS)**: Every controller method must have `@ApiOperation()`, `@ApiResponse()` (success + error), and `@ApiTags()` at the controller level. DTOs must use `@ApiProperty()` on every field. This is **blocker-severity** — same as missing tests.
- **Reviewer (NestJS)**: Check for Swagger decorators on every endpoint. Missing `@ApiOperation` or `@ApiResponse` on a public endpoint = `blocker`. Missing `@ApiProperty` on a DTO field = `major`.
- **Tester (NestJS)**: At Tier 2+ verification, include a Swagger doc validation check: `curl -sf http://localhost:3001/api/docs-json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"paths\"])} paths documented')"` (run inside the api container).
- **Bootstrap**: `main.ts` must set up SwaggerModule with title "Utsavs API", version from package.json, and serve at `/api/docs`.
- **Coder (Next.js)**: Not applicable (frontend has no Swagger). But if the Next.js coder creates Route Handlers (`app/api/`), they should have JSDoc comments describing the endpoint contract.

### 3. Docker-first development

All development runs inside Docker containers. No `pnpm dev` or `npm run dev` on the host.

- **Coder**: Never assume tools/services are available on the host. Code must work inside the Docker container. Database URLs use Docker service names (`postgres`, `redis`), not `localhost`. If a new service dependency is needed (e.g., a message queue), surface it — the main session will add it to `compose.yaml`.
- **Reviewer**: Flag any hardcoded `localhost` database/redis URLs as `blocker` — they must use environment variables that resolve to Docker service names. Flag any instructions to "run `npm install` locally" as `major`.
- **Tester**: Tests run inside the Docker container. Use `docker compose exec api <command>` for NestJS tests, `docker compose exec web <command>` for Next.js tests. If the container isn't running, start it first: `docker compose up -d api postgres redis`.
- **Main session gates**: Replace bare typecheck/lint commands with Docker-exec equivalents:
  - NestJS: `docker compose exec api npx tsc --noEmit --pretty 2>&1 | head -30`
  - Next.js: `docker compose exec web npx tsc --noEmit --pretty 2>&1 | head -30`
  - Lint: `docker compose exec <service> npx eslint --quiet <changed-files> 2>&1 | head -20`
- **Exceptions**: The AUTO-FORMAT.sh hook runs on the host (it's a PostToolUse hook). This is fine — prettier/eslint formatting doesn't need Docker. File edits by the coder also happen on the host (volume-mounted). Only test/build/typecheck commands must run inside containers.

---

## The agent roster

### Standard pipeline — NestJS (apps/api/)

| Agent | Model | Tools | Job |
|---|---|---|---|
| `NESTJS-CODER` | sonnet | full | writes NestJS code AND tests |
| `NESTJS-REVIEWER` | sonnet | read-only | JSON verdict (NestJS checklist) |
| `NESTJS-TESTER` | haiku | bash whitelisted | runs backend tests (verification ladder) |
| `CONTEXT-CURATOR` | haiku | writes confined to `.claude/context/` | updates wikis |

### Standard pipeline — Next.js (apps/web/)

| Agent | Model | Tools | Job |
|---|---|---|---|
| `NEXTJS-CODER` | sonnet | full | writes Next.js code AND tests |
| `NEXTJS-REVIEWER` | sonnet | read-only | JSON verdict (Next.js checklist) |
| `NEXTJS-TESTER` | haiku | bash whitelisted | runs frontend tests + build checks |
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

Repowise wikis are generated using the configured LLM provider (supports Gemini, OpenAI, Anthropic, Ollama). They complement the `.claude/context/` wikis maintained by the CONTEXT-CURATOR.

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

### Framework routing

Before delegating, determine the target framework from the task description and file paths:
- **NestJS tasks** (controllers, services, DTOs, guards, modules, `apps/api/`): use `NESTJS-CODER`, `NESTJS-REVIEWER`, `NESTJS-TESTER`
- **Next.js tasks** (pages, components, layouts, actions, route handlers, `apps/web/`): use `NEXTJS-CODER`, `NEXTJS-REVIEWER`, `NEXTJS-TESTER`
- **Cross-stack tasks**: split into two sequential delegations — backend first (NestJS agents), then frontend (Next.js agents)
- **Shared packages** (`packages/`): use whichever agent set is closer to the change (e.g., shared types used by the API → NestJS agents)

The examples below use `{CODER}`, `{REVIEWER}`, `{TESTER}` as placeholders for the framework-appropriate agent.

```
User prompt
  ↓ CLASSIFY-RISK.py hook: injects <risk_tier> tag
  ↓ ENRICH-PROMPT.py hook: injects relevant context wikis + dependency wikis
Main session (you)
  ↓ Read risk tier. Route Tier 1 to /QUICK.
  ↓ Determine target framework from task + file paths.
  ↓ Build context passport (see below).
  ↓ delegate: "Use {CODER} to implement <task>"
{CODER}
  ↓ returns: file list + summary + tests added
Main session
  ↓ TYPECHECK GATE: run inside Docker (see "Monorepo awareness" above)
  ↓ LINT GATE: `docker compose exec <service> npx eslint --quiet <changed-files> 2>&1 | head -20`
  ↓ if errors: return to CODER (does NOT count toward reviewer loop budget)
  ↓ if clean: build explicit file list from coder output
  ↓ delegate: "Use {REVIEWER} to review files: [explicit list]"
{REVIEWER}
  ↓ returns JSON: { verdict, issues[], summary }
  ↓ if rejected: loop back to {CODER} with the issues array
  ↓ if approved: continue
Main session
  ↓ delegate: "Use {TESTER} to run tests for <scope> at <risk tier>"
{TESTER} (verification ladder — depth matches risk tier)
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
  ↓ if approved: continue
Main session
  ↓ REPOWISE SYNC (if Repowise is indexed)
  ↓ run: repowise update --dry-run → check if changed files need wiki regeneration
  ↓ if stale: run repowise update → regenerates wiki pages for changed files
  ↓ report success to user (include Repowise sync result in final report)
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
**Framework**: <nestjs|nextjs|shared|cross-stack>
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

## Repowise wiki sync (post-pipeline)

After every successful pipeline run (tests passed, code shipped), keep Repowise's wiki in sync with the code changes. This is **not optional** if Repowise is indexed — stale wikis poison context for the next task.

### When to sync

- **After every standard pipeline completion** (coder → reviewer → tester → curator done)
- **After every `/QUICK` completion** that changed code
- **After audit Phase 5** completes all plan items (once, not per-item)
- **At session start** if the SEED-SESSION hook reports stale files

### How to sync

```bash
# Step 1: Check what's stale (zero cost, instant)
repowise update --dry-run 2>&1

# Step 2: If files are stale, update them (costs ~$0.005 per 5 files with Gemini)
repowise update 2>&1
```

### What to do with the output

The `repowise update` command outputs which wiki pages it regenerated. **Use this output meaningfully:**

1. **Include in your final report to the user:**
   ```
   Repowise: synced 3 wiki pages (users.service.ts, users.controller.ts, create-user.dto.ts)
   ```

2. **If Repowise update fails** (rate limit, API key expired, network error):
   - Report to user: "Repowise wiki sync failed: <reason>. The pipeline's `.claude/context/` wikis are still up to date (managed by CONTEXT-CURATOR), but Repowise's richer docs are now stale for the files you just changed."
   - Do NOT block the pipeline on this failure. The CONTEXT-CURATOR wikis are the baseline; Repowise is the upgrade.

3. **If Repowise update reports unexpected files** (files you didn't change are stale):
   - This means someone committed outside Claude Code, or a previous sync was interrupted.
   - Run the full update anyway — it keeps context fresh for future tasks.
   - Mention it: "Repowise also synced N other stale files from prior commits."

### Session-start sync

The SEED-SESSION hook runs `repowise update --dry-run` and reports stale files. If you see stale files in `<session_orientation>`, run `repowise update` before starting any coding task. The stale files list tells you exactly which modules have outdated context — if the user's task touches those modules, the context the ENRICH-PROMPT hook injects may be wrong.

```bash
# At session start, if stale files reported:
repowise update 2>&1
# Then proceed with the user's task — context is now fresh
```

### Repowise watch (for active development)

For users doing continuous development, `repowise watch` is better than manual syncs — it auto-updates wiki pages on every file save. Mention this to users during `/INIT`:

```bash
# Run in a separate terminal alongside Claude Code:
repowise watch
```

This replaces the need for post-pipeline `repowise update` calls during the session, since pages are regenerated on save. The session-start staleness check still applies (covers changes made outside the watch window).

---

## What the main session itself does

- **Reads risk tier** from `<risk_tier>` tag and routes accordingly.
- **Builds context passport** after coder completes — explicit file lists, test commands, wiki update flags.
- **Runs typecheck/lint gates** directly (bash, no subagent) before invoking reviewer.
- **Passes explicit file lists** to every downstream agent (Synthesis Mandate).
- **Tracks loop counts.** Enforce the budget.
- **Bridges human gates.** Auditor's Phase 4, MASTER's delegation requests.
- **Aggregates the final report.** What shipped, what tests passed, what wikis updated, what Repowise pages synced.
- **Syncs Repowise** after successful pipeline runs (`repowise update`). Surfaces stale files at session start.

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

### Keeping context fresh — the maintenance contract

| Source | When it updates | Who updates it | Cost |
|---|---|---|---|
| CONTEXT-CURATOR wikis | After coder changes public API surface | CONTEXT-CURATOR agent (haiku) | ~$0.002 per wiki |
| Repowise wiki | After every pipeline run | Main session runs `repowise update` | ~$0.005 per 5 files (Gemini) |
| Repowise wiki (dev mode) | On every file save | `repowise watch` daemon (user starts) | Same per file |
| Git hotspots | Session start (if >1 day stale) | SEED-SESSION hook (background) | Zero (shell script) |

**If Repowise is indexed, the main session MUST run `repowise update` after every successful pipeline run.** Skipping this causes context drift — the next task will get outdated wikis from ENRICH-PROMPT and stale results from `get_context()`. The cost is negligible (~$0.005 for 5 files on Gemini).
