# NestJS Multi-Agent `.claude/` Setup

A seven-agent Claude Code architecture specialized for NestJS backend development. Drop this `.claude/` directory at the root of your NestJS project and Claude Code will pick it up.

## Architecture at a glance

```
                                                     ┌─────────────────┐
                                                     │  Slash commands │
                                                     │  /QUICK /MASTER  │
                                                     │  /AUDIT         │
                                                     └────────┬────────┘
                                                              │
User prompt ───► UserPromptSubmit hook (inject context wikis) ▼
                          │
                          ▼
                Main session  (orchestrator)
                          │
        ┌─────────────────┼──────────────────┬──────────────────────┐
        │                 │                  │                      │
        ▼                 ▼                  ▼                      ▼
  STANDARD PIPELINE   FAST PATH        MASTER (opus)          AUDITOR (opus)
                                                                    │
                                          ┌─────────────────────────┴────┐
                                          ▼                              ▼
                                    AUDIT-REVIEWER × 5-10           standard pipeline
                                    (opus, parallel waves)          (sonnet/haiku for
                                                                    execution phase)
```

### The seven agents

| Tier | Agent | Model | Job |
|---|---|---|---|
| Standard | `NESTJS-CODER` | sonnet | writes code + tests |
| Standard | `NESTJS-REVIEWER` | sonnet | read-only structural review (JSON verdict) |
| Standard | `NESTJS-TESTER` | haiku | runs tests (bash whitelisted) |
| Standard | `CONTEXT-CURATOR` | haiku | updates `.claude/context/` wikis |
| Specialist | `MASTER` | opus | tough problems, design decisions; can request delegation |
| Specialist | `AUDITOR` | opus | end-to-end audit orchestrator with reports |
| Specialist | `AUDIT-REVIEWER` | opus | invoked by AUDITOR in parallel waves of 5-10 |

### The three slash commands

| Command | Flow |
|---|---|
| `/QUICK <task>` (or `quick:` prefix) | Fast path — coder only; reviewer judges if tests/full pipeline needed |
| `/MASTER <task>` | Invokes MASTER; delegation requests gated by user approval |
| `/AUDIT [scope]` | Full audit: parallel review → human-approved plan → execute → reports |

## Why this shape

- **Specialization where it pays.** Each agent has tools and a system prompt that match its job. The reviewer is *physically* read-only (no Write/Edit tools), so it cannot "fix it itself" and skip the gate.
- **Cost-aware model selection.** High-judgment work runs on `sonnet` or `opus` (rarely); mechanical work runs on `haiku`. The audit reserves opus for the diagnosis/synthesis phases and uses sonnet/haiku during execution.
- **Reject-early flow** (`coder → reviewer → tester`, *not* `coder → tester → reviewer`): static review is cheap, tests are expensive.
- **Hooks for everything deterministic**: context injection, format-on-save, secret-blocking, command whitelisting. LLM tokens are reserved for actual judgment.
- **Human gates where they matter**: MASTER's delegations and AUDITOR's plan both require user approval. The main session is the bridge.

## File layout

```
.claude/
├── CLAUDE.md                          # Orchestration rules — main session reads this
├── settings.json                      # Hook wiring
├── README.md                          # This file
│
├── agents/
│   ├── NESTJS-CODER.md                # sonnet — full tools — writes code + tests
│   ├── NESTJS-REVIEWER.md             # sonnet — READ-ONLY tools — JSON verdict
│   ├── NESTJS-TESTER.md               # haiku — bash whitelisted to test commands
│   ├── CONTEXT-CURATOR.md             # haiku — write restricted to .claude/context/
│   ├── MASTER.md                # opus — generalist for tough work
│   ├── AUDITOR.md                     # opus — end-to-end audit orchestrator
│   └── AUDIT-REVIEWER.md              # opus — parallel module reviewer (used by AUDITOR)
│
├── commands/                          # Slash commands
│   ├── QUICK.md                       # /QUICK — fast-path flow
│   ├── MASTER.md                      # /MASTER — MASTER invocation
│   └── AUDIT.md                       # /AUDIT — full audit
│
├── skills/
│   └── nestjs/                        # Loaded by coder + reviewer (and AUDIT-REVIEWER) on demand
│       ├── SKILL.md                   # Router + universal defaults
│       ├── LLD.md                     # SOLID, DRY, transactions, resilience, tests
│       ├── API-DESIGN.md              # HTTP method, route, status, envelope, pagination
│       └── CLI.md                     # `nest g ...`, `nest new`, monorepo
│
├── hooks/
│   ├── SEED-SESSION.sh                # SessionStart — orientation injection
│   ├── ENRICH-PROMPT.py               # UserPromptSubmit — grep wikis, inject matches
│   ├── BLOCK-SECRETS.py               # PreToolUse Write/Edit — block .env, .git, lockfiles
│   ├── RESTRICT-BASH-TESTER.py        # PreToolUse Bash — tester can only run test commands
│   ├── RESTRICT-WRITE-CURATOR.py      # PreToolUse Write/Edit — curator confined to .claude/context/
│   └── AUTO-FORMAT.sh                 # PostToolUse Write/Edit — prettier + eslint --fix on .ts
│
├── context/
│   ├── CONTEXT.md                     # Project index — auto-injected on code prompts
│   ├── modules/                       # Per-module wikis (curator manages)
│   └── decisions/                     # ADRs (curator manages)
│
└── audits/                            # Audit outputs (AUDITOR writes here)
    └── <YYYY-MM-DD-HHMMSS>/           # Per-audit directory
        ├── audit-meta.json
        ├── reviews/                   # Per-module reviews (parallel)
        ├── concern-analysis/          # Cross-cutting analysis
        ├── plan.md
        ├── plan-approved.md
        ├── execution-log.md
        └── reports/
            ├── security.md
            ├── code.md
            └── architecture.md
```

## Install

```bash
# from the root of your NestJS project
unzip claude-nestjs-agents.zip          # produces .claude/
chmod +x .claude/hooks/*.sh .claude/hooks/*.py
```

That's it. Claude Code reads `.claude/settings.json` automatically on the next session.

## How to use

### Routine work — just type the task

- *"Implement a `POST /users/:id/avatar` endpoint that uploads to S3."*
- *"There's a bug in `OrderService.cancel` — refunds aren't being created. Fix it."*

The main session reads `CLAUDE.md`, recognizes a code task, and runs the standard flow (coder → reviewer → tester → curator).

### Small change — use `/QUICK`

- *"/QUICK rename `getUser` to `findUserById` in users service"*
- *"quick: change the avatar endpoint to use PATCH instead of POST"*

Coder makes the change, reviewer judges if tests/full pipeline are needed, curator updates wiki only if structural.

### Hard problem — use `/MASTER`

- *"/MASTER design the auth module — should we use OAuth2 with PKCE, JWT with refresh rotation, or session cookies?"*
- *"/MASTER the standard pipeline keeps rejecting my fix for the race condition in OrderService — figure out what's actually wrong"*

MASTER engages with opus-grade reasoning. If it wants to delegate sub-tasks, the main session surfaces the delegation request to you for approval.

### End-to-end audit — use `/AUDIT`

- *"/AUDIT"* — full repo audit
- *"/AUDIT security only"* — narrowed scope
- *"/AUDIT module:users"* — single-module deep audit

Six phases:
1. Setup (timestamp, audit dir)
2. Parallel module review (5-10 opus reviewers per wave)
3. Cross-cutting concern analysis (security, transactions, tests, architecture)
4. **Plan presented to you for approval** ← human gate
5. Supervised execution via standard pipeline
6. Final reports (security, code, architecture) — concise, with mermaid diagrams, before/now per change

Outputs live in `.claude/audits/<timestamp>/`. Read `reports/architecture.md` first.

## Customizing

- **Add a new skill** (e.g. `prisma`, `bullmq`, `swagger`): drop it in `.claude/skills/<name>/SKILL.md`. Reference it from agent frontmatter under `skills:`.
- **Tighten or loosen hook rules**: edit the corresponding script in `.claude/hooks/`. The patterns in `BLOCK-SECRETS.py` and `RESTRICT-BASH-TESTER.py` are the main knobs.
- **Different model split**: edit the `model:` field in each agent's frontmatter.
- **Different language/framework**: replace the `nestjs` skill with one for your stack and rewrite the agent prompts. The orchestration flow itself is framework-agnostic.

## Trade-offs and limits

- **Hook types used**: only `command` (shell scripts). The `prompt` and `agent` hook types from some third-party blog posts are not part of the official spec and are deliberately avoided.
- **Subagent invocation**: standard agents are invoked via natural-language delegation. The AUDITOR invokes AUDIT-REVIEWERs via the Task tool for parallel execution. MASTER uses a request-and-confirm pattern instead of direct invocation, so the user remains in the loop on cost-significant calls.
- **The reviewer cannot see runtime behaviour.** It catches structural issues; the tester catches behavioural ones. The flow is designed so both gates exist — neither is sufficient alone.
- **Loop budgets** are advisory: the main session caps coder↔reviewer at 3 and coder↔tester at 2. Beyond that, escalate to the human. This is enforced by prompt, not by hook.
- **Skills are advisory, not enforced.** The `skills:` frontmatter is a declaration, not a hard restriction. The `AUDIT-REVIEWER` and `NESTJS-CODER` and `NESTJS-REVIEWER` declare `nestjs`; tester and curator do not. None of them is *physically* prevented from reading any file via Read tool — declaration is the right level of granularity for reference docs.
- **Audit cost**: a full audit runs many opus subagents. For a 10-module repo, expect 10-15 AUDIT-REVIEWER invocations + 4-6 concern analysis + AUDITOR's own opus reasoning + execution-phase pipeline cost. Run audits deliberately, not on every commit.

## Related references

- NestJS skill (`.claude/skills/nestjs/`) is self-contained and can be used in any project that wants the same code-quality bar, even without the agents.
- The audit flow's six-phase structure is documented in detail in `.claude/agents/AUDITOR.md`.
