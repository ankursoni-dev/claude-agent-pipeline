# Agent Pipeline

A multi-agent Claude Code architecture for NestJS and Next.js development. Supports standalone projects and monorepos. Drop this `.claude/` directory into any NestJS or Next.js project and Claude Code picks it up automatically.

## Quick Install

```bash
# From the root of your NestJS project:
bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_USER/claude-agent-pipeline/main/install.sh)

# Then open Claude Code and run:
/INIT
```

The install script backs up any existing `.claude/`, downloads the pipeline, and installs Repowise. The `/INIT` command inside Claude Code handles Repowise configuration, wiki generation, and validation.

## Architecture

```
User prompt
  ↓ CLASSIFY-RISK.py → <risk_tier> tag (keyword heuristics, zero LLM)
  ↓ ENRICH-PROMPT.py → inject module wikis + dependency wikis
  ↓
Main session (orchestrator)
  ↓ reads risk tier → routes to flow
  │
  ├─ Tier 1 ──► /QUICK flow (coder → typecheck gate → reviewer → conditional tests)
  ├─ Tier 2 ──► Standard flow (coder → typecheck/lint gate → reviewer → targeted tests → conditional curator)
  ├─ Tier 3 ──► Full pipeline (coder → gates → reviewer → deep tests → curator → wiki review)
  │
  Coder auto-detects NestJS vs Next.js from file paths and loads the correct skill set.
  ├─ /MASTER ─► MASTER (opus) → delegation requests → user approval
  └─ /AUDIT ──► AUDITOR (opus) → plan → user approval → execute via standard pipeline → reports
```

### The agents

| Agent | Model | Job |
|---|---|---|
| `NESTJS-CODER` | sonnet | Writes NestJS backend code + tests. Uses `nestjs` skill. |
| `NESTJS-REVIEWER` | sonnet | Read-only NestJS review. JSON verdict with NestJS checklist. |
| `NESTJS-TESTER` | haiku | Runs backend tests (Quick Smoke / Targeted / Deep). Returns JSON. |
| `NEXTJS-CODER` | sonnet | Writes Next.js frontend code + tests. Uses `nextjs` skill. |
| `NEXTJS-REVIEWER` | sonnet | Read-only Next.js review. JSON verdict with Next.js checklist. |
| `NEXTJS-TESTER` | haiku | Runs frontend tests + build checks. Returns JSON. |
| `CONTEXT-CURATOR` | haiku | Updates `.claude/context/` module wikis. Writes confined by hook. |
| `MASTER` | opus | Hard problems, design decisions, stalled loops. Can request delegation. |
| `AUDITOR` | opus | End-to-end audit. Delegates Phase 1 reviews to sonnet. Plans + reports only. |

### Slash commands

| Command | Flow |
|---|---|
| `/INIT` | First-run setup: validate project, configure Repowise, generate wikis |
| `/QUICK <task>` | Fast path for trivial changes (renames, config tweaks) |
| `/MASTER <task>` | Invokes opus-level reasoning; delegation requests gated by user approval |
| `/AUDIT [scope]` | Full audit: module review → plan → user approval → execute → reports |

### Key design principles

- **Risk-based routing**: Tier 1 (trivial) auto-routes to `/QUICK`. Tier 3 (cross-cutting) gets the full pipeline. No wasted tokens on simple renames.
- **Reject early, reject cheap**: CODE → typecheck gate (free) → REVIEW (sonnet) → TEST (haiku). Static review before expensive tests.
- **Synthesis mandate**: Every delegation includes explicit file lists, coder summaries, and acceptance criteria. No "find them via Glob."
- **Context passport**: Compact summary that travels through the pipeline. Each agent gets exactly the context it needs.
- **Hook-enforced safety**: Reviewer is physically read-only. Tester can only run test commands. Curator can only write to `.claude/context/`. Secrets are blocked. All enforced by `PreToolUse` hooks.

## File layout

```
.claude/
├── CLAUDE.md                          # Orchestration rules (main session reads this)
├── settings.json                      # Hook wiring
├── README.md                          # This file
│
├── agents/
│   ├── NESTJS-CODER.md                # sonnet — writes NestJS backend code + tests
│   ├── NESTJS-REVIEWER.md             # sonnet — NestJS read-only review
│   ├── NESTJS-TESTER.md               # haiku — backend verification ladder
│   ├── NEXTJS-CODER.md                # sonnet — writes Next.js frontend code + tests
│   ├── NEXTJS-REVIEWER.md             # sonnet — Next.js read-only review
│   ├── NEXTJS-TESTER.md               # haiku — frontend tests + build checks
│   ├── CONTEXT-CURATOR.md             # haiku — wiki updates confined to .claude/context/
│   ├── MASTER.md                      # opus — generalist for tough problems
│   └── AUDITOR.md                     # opus — audit planner + reporter
│
├── commands/
│   ├── INIT.md                        # /INIT — first-run setup
│   ├── QUICK.md                       # /QUICK — fast-path with typecheck/lint gate
│   ├── MASTER.md                      # /MASTER — opus invocation
│   └── AUDIT.md                       # /AUDIT — full audit with incremental support
│
├── skills/
│   ├── nestjs/
│   │   ├── SKILL.md                   # Router + universal defaults
│   │   ├── LLD.md                     # SOLID, DRY, transactions, resilience, tests
│   │   ├── API-DESIGN.md              # HTTP method, route, status, envelope, pagination
│   │   ├── CLI.md                     # nest g, nest new, monorepo
│   │   └── REVIEWER-CHECKLIST.md      # Condensed NestJS checklist for reviewer
│   └── nextjs/
│       ├── SKILL.md                   # App Router conventions, layer responsibilities
│       ├── LLD.md                     # Server/Client Components, data fetching, caching
│       ├── COMPONENT-DESIGN.md        # Composition patterns, forms, state management
│       └── REVIEWER-CHECKLIST.md      # Condensed Next.js checklist for reviewer
│
├── hooks/
│   ├── SEED-SESSION.sh                # SessionStart — project orientation + Repowise status
│   ├── CLASSIFY-RISK.py               # UserPromptSubmit — risk tier (1/2/3) classification
│   ├── ENRICH-PROMPT.py               # UserPromptSubmit — wiki injection + dependency walking
│   ├── BLOCK-SECRETS.py               # PreToolUse — blocks .env, .git, lockfiles
│   ├── RESTRICT-BASH-TESTER.py        # PreToolUse — tester can only run test commands
│   ├── RESTRICT-WRITE-CURATOR.py      # PreToolUse — curator confined to .claude/context/
│   ├── AUTO-FORMAT.sh                 # PostToolUse — prettier + eslint on .ts files
│   └── GIT-HOTSPOTS.sh               # On-demand — git churn analysis for audits
│
├── context/
│   ├── CONTEXT.md                     # Project index (auto-injected on code prompts)
│   ├── modules/                       # Per-module wikis (curator + Repowise manage)
│   └── decisions/                     # ADRs
│
├── audits/                            # Audit outputs (AUDITOR writes here)
│   └── baseline.json                  # Incremental audit state (after first audit)
│
└── REPOWISE-INTEGRATION.md           # Repowise MCP setup guide
```

## Repowise Integration (Optional)

Repowise provides rich codebase intelligence via MCP: architecture wikis, dependency graphs, risk scores, dead code detection, semantic search. It works with any LLM provider (Gemini for cheap, Anthropic for quality, Ollama for free).

The pipeline works without Repowise — it falls back to keyword-based risk classification and manually-curated wikis. But with Repowise, agents get richer context and the AUDITOR gets data-driven risk scores.

Setup: run `/INIT` inside Claude Code, or see `REPOWISE-INTEGRATION.md`.

## Customizing

- **Add a new framework skill**: Drop it in `.claude/skills/<framework>/SKILL.md`. Reference from agent frontmatter `skills:`. Update the coder's framework detection section.
- **Change model assignments**: Edit the `model:` field in agent frontmatter. The cost-quality tradeoff is yours.
- **Add a new hook**: Add to `.claude/hooks/` and wire in `settings.json`.
- **Adjust risk tiers**: Edit keyword patterns in `.claude/hooks/CLASSIFY-RISK.py`.
- **Tune verification depth**: Edit the verification ladder table in `NESTJS-TESTER.md`.
