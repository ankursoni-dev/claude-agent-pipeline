# Agent Pipeline for Claude Code

A production-grade multi-agent system that turns Claude Code into an opinionated development team for NestJS and Next.js. Nine specialized agents handle code generation, structural review, testing, documentation, architectural decisions, and full codebase audits — each with enforced tool restrictions, model-appropriate assignments, and structured handoff contracts.

Built for NestJS + Next.js. Supports monorepos. Optimized for token efficiency.

---

## Install

From the root of your NestJS project:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ankursoni-dev/claude-agent-pipeline/master/install.sh)
```

The script checks for `@nestjs/core` in your `package.json`, backs up any existing `.claude/` directory (asks first), downloads the pipeline, installs Repowise, and updates `.gitignore`. Then open Claude Code and run:

```
/INIT
```

This walks you through Repowise configuration (optional — the pipeline works without it), generates codebase wikis, and validates the setup. After `/INIT` completes, just start describing what you want to build.

---

## How It Works

Every prompt goes through a zero-cost classification and context injection pipeline before reaching any agent:

```
User prompt
   |
   v
CLASSIFY-RISK.py            (keyword heuristics, zero LLM cost)
   | injects <risk_tier>       Tier 1: trivial (rename, typo, config)
   |                           Tier 2: contained (bug fix, DTO change)
   v                           Tier 3: cross-cutting (new module, endpoint)
ENRICH-PROMPT.py            (deterministic wiki injection, zero LLM cost)
   | injects module wikis      direct match + dependency walking
   v
Main session reads tier + detects framework, routes to the right agent set
```

The risk tier determines how much pipeline the task gets. The framework determines which agents run:

```
                          NestJS (apps/api/)              Next.js (apps/web/)
Tier 1 -----> /QUICK flow (NESTJS-CODER + gate + rev)    (NEXTJS-CODER + gate + rev)
Tier 2 -----> Standard    (coder + gates + rev + tests)   (coder + gates + rev + tests)
Tier 3 -----> Full        (coder + gates + rev + tests + curator)
```

---

## The Standard Pipeline

The default flow for any implementation task. The ordering is deliberate: static review is cheap (sonnet, read-only), tests are expensive (DB, network). Reject early, reject cheap.

```
NESTJS-CODER (sonnet)
   | writes code AND tests in one pass
   | returns: file list + summary + wiki ingredients
   v
Typecheck Gate (tsc --noEmit)         <-- free, ~2 seconds
Lint Gate (eslint --quiet)            <-- free, ~2 seconds
   | if errors: return to coder (does NOT count toward loop budget)
   v
NESTJS-REVIEWER (sonnet, read-only)
   | reads explicit file list from coder output (no Glob/Grep discovery)
   | applies condensed REVIEWER-CHECKLIST (80 lines, not 800)
   | returns: JSON { verdict, issues[], summary }
   | if rejected: loop back to coder (max 3 rounds)
   v
NESTJS-TESTER (haiku, bash-whitelisted)
   | verification ladder matched to risk tier:
   |   Tier 1: Quick Smoke (related tests only)
   |   Tier 2: Targeted Regression (module suite)
   |   Tier 3: Deep Verification (full suite + e2e)
   | returns: JSON { passed, failures[] }
   | if failed: loop back to coder (max 2 rounds)
   v
CONTEXT-CURATOR (haiku, write-confined)
   | updates .claude/context/modules/<module>.md wiki
   | skipped unless public API surface changed
   v
NESTJS-REVIEWER (reviews wiki diff)
   | if approved: done
```

### Context Passport

The main session builds a compact summary after the coder returns and passes it through the pipeline. Each agent gets exactly the context it needs — no redundant file reads:

```
Context Passport
  Risk tier:        2 (contained)
  Changed files:    src/modules/users/users.service.ts (modified)
                    src/modules/users/users.service.spec.ts (new)
  Dependencies:     src/modules/users/users.controller.ts (for layering check)
  Coder summary:    "Added createUser method with validation..."
  Test command:     npx jest src/modules/users/
  Wiki update:      yes (new public endpoint)
```

### Synthesis Mandate

Every delegation proves the main session understood the upstream output. No vague handoffs:

```
-- Bad:  "Review the changes the coder made"
-- Good: "Review these files:
            Changed: src/modules/users/users.service.ts (modified)
            Deps:    src/modules/users/users.controller.ts (layering check)
            Summary: Added createUser with validation + DTO projection"
```

---

## The Agents

| Agent | Model | Tools | What It Does |
|-------|-------|-------|-------------|
| NESTJS-CODER | sonnet | full | Writes NestJS backend code AND tests. Uses the `nestjs` skill set. |
| NESTJS-REVIEWER | sonnet | read-only | Structural review against NestJS checklist. JSON verdict with file:line references. |
| NESTJS-TESTER | haiku | bash (whitelisted) | Runs backend tests at risk-proportional depth. JSON pass/fail report. |
| NEXTJS-CODER | sonnet | full | Writes Next.js frontend code AND tests. Uses the `nextjs` skill set. |
| NEXTJS-REVIEWER | sonnet | read-only | Structural review against Next.js checklist (server/client boundary, data fetching, performance). |
| NEXTJS-TESTER | haiku | bash (whitelisted) | Runs frontend tests + build checks. JSON pass/fail report. |
| CONTEXT-CURATOR | haiku | write-confined | Updates module wikis under `.claude/context/`. Cannot write anywhere else (enforced by hook). |
| MASTER | opus | full | Deep reasoning for hard problems: architecture decisions, cross-module debugging, stalled pipeline rescue. |
| AUDITOR | opus | full | End-to-end codebase audit. Delegates Phase 1 reviews to sonnet reviewers. Produces plan for human approval. |

### Tool restrictions enforced by hooks

The safety model is not "please don't do X" — it's "you physically cannot do X":

- NESTJS-REVIEWER has no Write/Edit tools. It cannot fix code itself.
- NESTJS-TESTER's Bash is whitelisted to test commands only. `rm`, `git`, `curl` are blocked.
- CONTEXT-CURATOR's Write/Edit is confined to `.claude/context/`. Source code edits are blocked.
- All agents are blocked from writing to `.env`, `.git/`, `node_modules/`, `dist/`, lockfiles.

---

## Commands

### /QUICK — Fast path for trivial changes

For renames, config tweaks, comment updates, import reordering. Tier 1 tasks auto-route here.

```
Coder makes the change (no new tests unless new code path)
   v
Typecheck + Lint gate (free)
   v
Reviewer judges: recommend_full_pipeline? recommend_tests?
   v
Branch: full pipeline / just tests / done
```

### /MASTER — Opus-level reasoning

For hard problems, design decisions, ambiguous specs, or when the standard pipeline is stuck.

```
MASTER (opus) analyzes the problem
   v
Either: self-contains the answer
Or:     returns DELEGATION REQUESTs
           v
        Main session surfaces each to user for approval
           v
        Approved delegations execute via standard pipeline
```

### /AUDIT — Full codebase audit

Six phases. The AUDITOR plans and reports; the main session executes.

```
Phase 0: Setup (audit directory, metadata)
Phase 1: Module reviews (AUDITOR requests, REVIEWER executes in audit mode)
Phase 2: Cross-cutting concern analysis (security, transactions, resilience)
Phase 3: Plan generation (prioritized P0/P1/P2 items)
Phase 4: Human gate (user approves/modifies/defers)
Phase 5: Main session executes plan via standard pipeline
Phase 6: AUDITOR writes reports (security.md, code.md, architecture.md)
```

Supports incremental audits: if `baseline.json` exists from a previous audit, only changed modules are re-reviewed.

### /INIT — First-run setup

Run once after installing. Validates the project, configures Repowise, generates wikis, and confirms the pipeline is ready.

---

## Hook System

Eight hooks fire automatically at different lifecycle points. All are deterministic (zero LLM cost) except the agents themselves:

| Hook | Trigger | What It Does |
|------|---------|-------------|
| SEED-SESSION.sh | Session start | Injects NestJS version, git branch, agent roster, Repowise status |
| CLASSIFY-RISK.py | Before each prompt | Classifies change into Tier 1/2/3 via keyword heuristics |
| ENRICH-PROMPT.py | Before each prompt | Injects module wikis + walks dependency graph for related wikis |
| BLOCK-SECRETS.py | Before any write | Blocks writes to .env, .git/, lockfiles, node_modules/, dist/ |
| RESTRICT-BASH-TESTER.py | Before tester's bash | Whitelists test commands only (jest, npm test, etc.) |
| RESTRICT-WRITE-CURATOR.py | Before curator's write | Confines writes to .claude/context/ |
| AUTO-FORMAT.sh | After any write | Runs prettier + eslint --fix on .ts files (advisory, non-blocking) |
| GIT-HOTSPOTS.sh | On demand | Generates git churn data for audit prioritization |

---

## Skill System

The pipeline includes comprehensive framework-specific references that agents consult. The coder auto-detects NestJS vs Next.js from file paths and loads the correct skill set. The reviewer loads only the condensed checklist for the relevant framework.

### NestJS Skills (`skills/nestjs/`)

- **SKILL.md** — Universal defaults: ValidationPipe config, layer responsibilities, response envelope shape, project layout
- **LLD.md** — Low-level design: SOLID principles, error handling, transactions, resilience, test discipline (16 sections)
- **API-DESIGN.md** — Endpoint contracts: HTTP methods, route shapes, status codes, pagination, idempotency, file uploads
- **CLI.md** — Scaffolding: `nest g resource`, `nest new`, monorepo setup
- **REVIEWER-CHECKLIST.md** — Condensed checklist extracted from LLD.md for the reviewer

### Next.js Skills (`skills/nextjs/`)

- **SKILL.md** — Universal defaults: App Router file conventions, layer responsibilities (Server vs Client Components), project layout, response patterns
- **LLD.md** — Low-level design: Server/Client Component decision rules, data fetching hierarchy, Server Actions, Route Handlers, error handling, caching, middleware, testing (13 sections)
- **COMPONENT-DESIGN.md** — Component patterns: composition (server parent/client leaf), form handling with useActionState, state management hierarchy, loading/streaming patterns, error boundaries, shared component rules
- **REVIEWER-CHECKLIST.md** — Condensed checklist for Next.js code review (Server/Client boundary, data fetching, performance, accessibility)

---

## Repowise Integration (Optional)

Repowise adds rich codebase intelligence via MCP: architecture wikis, dependency graphs, PageRank-based file importance, git-informed risk scores, dead code detection, and semantic search. It works with any LLM provider.

The pipeline works without Repowise — it falls back to keyword-based classification and manually curated wikis. With Repowise, agents get richer context and the AUDITOR gets data-driven analysis.

Setup happens during `/INIT`. Provider options: OpenRouter (cheapest, ~$0.05 to index a 50-file project), Anthropic (highest quality), Ollama (free, local). See `.claude/REPOWISE-INTEGRATION.md` for details.

---

## Token Optimization

The pipeline is designed to minimize Claude token usage at every step:

- **Risk-based routing** — Trivial changes skip the full pipeline. Only Tier 3 tasks get all steps.
- **Typecheck/lint gates** — Free bash calls (tsc, eslint) catch ~30% of issues before the reviewer sees them.
- **Condensed reviewer skill** — 80 lines instead of 800. The reviewer loads only its checklist, not the full SOLID reference.
- **Synthesis mandate** — Explicit file lists eliminate downstream Glob/Grep discovery.
- **Context passport** — Compact summary travels through the pipeline. No redundant file reads.
- **Conditional wiki ingredients** — Coder skips the 20-line wiki section when public surface didn't change (~60% of tasks).
- **Verification ladder** — Tester runs proportional to risk. Quick Smoke for Tier 1, full suite for Tier 3.
- **Dependency-aware injection** — ENRICH-PROMPT walks the dependency graph, injecting relevant wikis the user didn't mention.
- **Zero-cost hooks** — Classification, enrichment, formatting all run as shell/Python scripts, not LLM calls.

---

## File Structure

```
.claude/
  CLAUDE.md                    Orchestration rules (the main session's playbook)
  settings.json                Hook wiring
  REPOWISE-INTEGRATION.md     Repowise setup guide

  agents/
    NESTJS-CODER.md            sonnet -- writes NestJS code + tests
    NESTJS-REVIEWER.md         sonnet -- NestJS read-only review
    NESTJS-TESTER.md           haiku  -- backend verification ladder
    NEXTJS-CODER.md            sonnet -- writes Next.js code + tests
    NEXTJS-REVIEWER.md         sonnet -- Next.js read-only review
    NEXTJS-TESTER.md           haiku  -- frontend tests + build checks
    CONTEXT-CURATOR.md         haiku  -- wiki updates
    MASTER.md                  opus   -- hard problems
    AUDITOR.md                 opus   -- audit planner + reporter

  commands/
    INIT.md                    /INIT  -- first-run setup
    QUICK.md                   /QUICK -- fast path with gates
    MASTER.md                  /MASTER -- opus invocation
    AUDIT.md                   /AUDIT -- full audit

  skills/
    nestjs/
      SKILL.md                 Router + universal defaults
      LLD.md                   SOLID, DRY, transactions, resilience, tests
      API-DESIGN.md            HTTP contracts, envelope, pagination
      CLI.md                   Scaffolding, monorepo
      REVIEWER-CHECKLIST.md    Condensed NestJS checklist
    nextjs/
      SKILL.md                 App Router conventions, layer responsibilities
      LLD.md                   Server/Client Components, data fetching, actions, caching
      COMPONENT-DESIGN.md      Composition patterns, forms, state management
      REVIEWER-CHECKLIST.md    Condensed Next.js checklist

  hooks/
    SEED-SESSION.sh            Session orientation
    CLASSIFY-RISK.py           Risk tier classification
    ENRICH-PROMPT.py           Wiki injection + dependency walking
    BLOCK-SECRETS.py           Write protection for sensitive files
    RESTRICT-BASH-TESTER.py    Tester command whitelist
    RESTRICT-WRITE-CURATOR.py  Curator write confinement
    AUTO-FORMAT.sh             Prettier + ESLint on save
    GIT-HOTSPOTS.sh            Git churn analysis

  context/
    CONTEXT.md                 Project index (auto-injected)
    modules/                   Per-module wikis
    decisions/                 Architectural decision records
```

---

## Contributing

Fork the repository and submit a pull request. The repo is public — no collaborator access needed to fork and PR.

Areas where contributions are welcome: additional NestJS skills (Prisma, TypeORM, BullMQ, GraphQL), alternative framework adaptations, hook improvements, and documentation.

---

## License

MIT
