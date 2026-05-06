# Repowise Integration Design

**Status**: Design — ready for implementation
**Date**: 2026-05-05
**Decision**: Use Repowise directly as MCP server instead of custom intelligence layer

---

## Why Repowise Instead of Custom Scripts

The original plan was to build a custom intelligence layer (openrouter_client.py, wiki_builder.py, etc.) that reimplemented Repowise patterns. After inspecting the Repowise source code, it became clear that Repowise already provides everything we need:

| Feature | Custom Scripts | Repowise |
|---|---|---|
| Wiki generation | Basic module wikis | 8-level hierarchical wikis (file, symbol, module, architecture) |
| Dependency graph | Regex-based import parsing | Tree-sitter AST + PageRank + betweenness centrality |
| NestJS support | Manual decorator parsing | Auto-detects @Module, @Controller, @Injectable decorators |
| LLM provider | Custom OpenRouter client | Native OpenRouter, Anthropic, OpenAI, Gemini, Ollama support |
| Auto-updates | Manual freshness checking | `repowise watch` (file watcher) + `repowise update` (git diff) |
| Dead code | Shell script grep | Graph-based: unreachable files, unused exports, confidence scoring |
| Risk assessment | Keyword heuristics | Git churn + dependents + bus factor + co-change analysis |
| MCP server | None | Production-ready: 7 tools, stdio + SSE transports |
| Database | JSON files | SQLite (embedded) + LanceDB (vector search) |
| Cost tracking | len(text)//4 estimate | Per-model pricing, per-operation tracking |

## Setup Instructions

### 1. Install Repowise

```bash
pip install repowise
# or
uv tool install repowise
```

### 2. Initialize for this project

```bash
cd <project-root>

# Using OpenRouter (cheapest option — uses your existing key):
export OPENROUTER_API_KEY="sk-..."  # from your .env
repowise init --provider openrouter --model google/gemini-2.0-flash-001

# Or using a local model via Ollama (zero API cost):
# repowise init --provider ollama --model llama3.1:8b
```

This creates `.repowise/` with SQLite DB, LanceDB vector index, and config.

### 3. Generate initial wiki

```bash
repowise generate  # Full wiki generation for the whole repo
```

This analyzes the codebase using tree-sitter, builds the dependency graph, and generates wiki pages using the configured LLM provider. For a ~50 file NestJS project with OpenRouter Gemini Flash, this costs ~$0.05 and takes ~2 minutes.

### 4. Start the MCP server

Add to Claude Code's MCP configuration:

```json
{
  "mcpServers": {
    "repowise": {
      "command": "repowise",
      "args": ["mcp", "."]
    }
  }
}
```

Or start manually for testing:

```bash
repowise mcp .              # stdio mode (for Claude Code)
repowise mcp . --transport sse  # SSE mode (for web clients)
```

### 5. Enable auto-updates

```bash
# Option A: File watcher (background process)
repowise watch .

# Option B: Post-commit hook (recommended for CI)
# Add to .git/hooks/post-commit:
repowise update --since HEAD~1

# Option C: Claude Code hooks (auto-installed)
repowise install-hooks
```

---

## How the Pipeline Uses Repowise

### Querying (during pipeline runs)

The main session and agents can call Repowise MCP tools for richer context at any point:

```
User prompt
  ↓ CLASSIFY-RISK.py (keyword heuristics — fast baseline)
  ↓ ENRICH-PROMPT.py (wiki injection — zero LLM cost)
Main session
  ↓ [Optional] get_risk(<likely-affected-files>) → more accurate risk tier
  ↓ [Optional] get_context(<module>) → rich module docs for the coder
  ↓ delegate to {CODER} (with enriched context)
  ... pipeline runs: coder → reviewer → tester → curator ...
  ↓ REPOWISE SYNC: repowise update → regenerate wiki pages for changed files
  ↓ report to user (includes: files synced, any failures)
```

Repowise tools are **additive** — they provide better context but the pipeline works without them. If Repowise is unavailable, the keyword-based CLASSIFY-RISK and wiki-based ENRICH-PROMPT are the fallbacks.

### Wiki sync (after pipeline runs)

This is the key integration point — without it, Repowise's wiki drifts from reality:

| When | What runs | Output used for |
|---|---|---|
| **Session start** | `repowise update --dry-run` (in SEED-SESSION hook) | Surfaces stale files in `<session_orientation>` so main session knows to run `repowise update` before coding tasks that touch stale modules |
| **After standard pipeline** | `repowise update` (main session) | Pages regenerated list included in final report to user; confirms context is fresh for the next task |
| **After `/QUICK`** | `repowise update` (main session) | Same as above |
| **After audit Phase 5** | `repowise update` once (main session) | Sync output appended to `execution-log.md`; AUDITOR reads it during Phase 6 reports |
| **During active dev** | `repowise watch` (user runs in terminal) | Auto-syncs on file save; replaces need for manual `repowise update` calls |

### Audit Flow

The AUDITOR benefits most from Repowise:

- **Phase 0**: `get_overview()` provides instant architecture summary, hotspot files, tech stack
- **Phase 1**: `get_context(module)` provides pre-generated module docs, reducing what the reviewer needs to read
- **Phase 2**: `get_risk()` provides data-driven risk scores; `get_dead_code()` provides graph-based dead code candidates
- **Phase 3**: `get_why(query)` surfaces architectural decisions from git archaeology

### Context Curator vs Repowise

Both coexist. They serve different purposes:

| Source | Content | Update mechanism | Fallback? |
|---|---|---|---|
| CONTEXT-CURATOR wikis (`.claude/context/`) | Human-curated: module purpose, public API, decisions, integration points | CONTEXT-CURATOR agent (haiku) after public API changes | Yes — always works, even without Repowise |
| Repowise wikis (`.repowise/`) | Auto-generated: symbol-level docs, dependency graphs, risk scores, dead code | `repowise update` / `repowise watch` | Upgrade — richer but requires setup + LLM API key |

ENRICH-PROMPT injects `.claude/context/` wikis regardless of Repowise status. Repowise's MCP tools are called on-demand for deeper context.

---

## Cost Profile

### With OpenRouter (google/gemini-2.0-flash-001)

| Operation | Tokens | Cost |
|---|---|---|
| Initial `repowise generate` (50 files) | ~500K | ~$0.05 |
| `repowise update` (5 changed files) | ~50K | ~$0.005 |
| `get_context()` per call | ~2K output | ~$0.0002 |
| `get_risk()` per call | ~1K output | ~$0.0001 |
| `get_overview()` per call | ~3K output | ~$0.0003 |

**Total per pipeline run**: ~$0.001 for 2-3 MCP tool calls
**Total per day** (50 pipeline runs): ~$0.05 + auto-update costs

### Compared to Claude-only pipeline

The pipeline improvements (condensed reviewer checklist, explicit file lists, typecheck gates, verification ladder) reduce Claude token usage by ~35-45% regardless of Repowise. Adding Repowise provides an additional ~10-15% reduction by pre-computing context the coder/reviewer would otherwise discover via Glob/Grep.

---

## Model Recommendations for Repowise

| Model | Provider | Cost | Quality | Best For |
|---|---|---|---|---|
| `google/gemini-2.0-flash-001` | OpenRouter | ~$0.075/M input | Good for docs | Default choice — fast, cheap, reliable |
| `deepseek/deepseek-chat-v3-0324` | OpenRouter | ~$0.14/M input | Good for code | Fallback if Gemini is down |
| `anthropic/claude-haiku-4-5` | OpenRouter | ~$0.80/M input | Highest quality | When you want the best wikis (still cheaper than direct Anthropic) |
| `llama3.1:8b` | Ollama (local) | $0.00 | Acceptable | Zero-cost option if you have GPU |

Configure in `.repowise/config.yaml`:
```yaml
provider: openrouter
model: google/gemini-2.0-flash-001
```

---

## What Stays Custom (Not Replaced by Repowise)

| Component | Why It Stays |
|---|---|
| `CLASSIFY-RISK.py` hook | Zero-cost keyword heuristic; faster than an MCP call. Repowise `get_risk()` is an optional upgrade. |
| `ENRICH-PROMPT.py` hook | Injects `.claude/context/` wikis deterministically. Works without Repowise. |
| `GIT-HOTSPOTS.sh` | Simple shell script for audit prioritization. Repowise provides richer data but this is zero-cost. |
| `REVIEWER-CHECKLIST.md` | Condensed skill reference — not a wiki, it's a prompt optimization. |
| `CONTEXT-CURATOR` agent | Still needed for ADRs, human-curated decisions, and when Repowise is unavailable. |
| All pipeline improvements | Typecheck gates, verification ladder, context passport, synthesis mandate — these are orchestration improvements, not context improvements. |

---

## Implementation Checklist

- [ ] Install Repowise: `pip install repowise` or `uv tool install repowise`
- [ ] Initialize: `repowise init --provider openrouter --model google/gemini-2.0-flash-001`
- [ ] Generate wiki: `repowise generate`
- [ ] Add MCP server to Claude Code config
- [ ] Update `.gitignore`: add `.repowise/` (contains local DB, not committed)
- [ ] Test MCP tools: `get_overview()`, `get_context("src/modules/tasks")`, `get_risk("src/modules/tasks/tasks.service.ts")`
- [ ] Optional: configure backup model in `.repowise/config.yaml`

### Wiki freshness (already wired into the pipeline)

These are handled automatically — no manual setup needed:

- **SEED-SESSION.sh** runs `repowise update --dry-run` at session start, surfaces stale files
- **CLAUDE.md** instructs main session to run `repowise update` after every successful pipeline run
- **QUICK.md** includes Repowise sync step in its final report
- **AUDIT.md** runs `repowise update` once after Phase 5 completes, logs output to execution-log.md

### Optional but recommended

- [ ] Run `repowise watch` in a separate terminal during active development (auto-syncs on file save)
- [ ] Add a git post-commit hook: `repowise update --since HEAD~1` (catches changes made outside Claude Code)
