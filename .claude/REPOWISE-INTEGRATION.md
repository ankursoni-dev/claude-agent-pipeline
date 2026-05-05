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

### Standard Flow

The main session can optionally call Repowise tools for richer context:

```
User prompt
  ↓ CLASSIFY-RISK.py (keyword heuristics — fast baseline)
  ↓ ENRICH-PROMPT.py (wiki injection — zero LLM cost)
Main session
  ↓ [Optional] get_risk(<likely-affected-files>) → more accurate risk tier
  ↓ [Optional] get_context(<module>) → rich module docs for the coder
  ↓ delegate to NESTJS-CODER (with enriched context)
  ... rest of pipeline unchanged ...
```

Repowise tools are **additive** — they provide better context but the pipeline works without them. If Repowise is unavailable, the keyword-based CLASSIFY-RISK and wiki-based ENRICH-PROMPT are the fallbacks.

### Audit Flow

The AUDITOR benefits most from Repowise:

- **Phase 0**: `get_overview()` provides instant architecture summary, hotspot files, tech stack
- **Phase 1**: `get_context(module)` provides pre-generated module docs, reducing what the reviewer needs to read
- **Phase 2**: `get_risk()` provides data-driven risk scores; `get_dead_code()` provides graph-based dead code candidates
- **Phase 3**: `get_why(query)` surfaces architectural decisions from git archaeology

### Context Curator Replacement

For projects with Repowise, the CONTEXT-CURATOR's wiki generation can be partially replaced:

| Wiki Source | When to Use |
|---|---|
| Repowise-generated wikis | Available via MCP, richer content, auto-updated |
| CONTEXT-CURATOR wikis | Fallback when Repowise unavailable; also for ADRs and human-curated decisions |

Both can coexist. ENRICH-PROMPT injects `.claude/context/` wikis regardless of Repowise status. Repowise's MCP tools are called on-demand for deeper context.

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
- [ ] Enable auto-updates: `repowise watch .` or post-commit hook
- [ ] Test MCP tools: `get_overview()`, `get_context("src/modules/tasks")`, `get_risk("src/modules/tasks/tasks.service.ts")`
- [ ] Update `.gitignore`: add `.repowise/` (contains local DB, not committed)
- [ ] Optional: configure backup model in `.repowise/config.yaml`
