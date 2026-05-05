---
description: First-run setup for the NestJS Agent Pipeline. Initializes Repowise, generates codebase wikis, validates hooks, and confirms the pipeline is ready. Run this once after installing the pipeline into a new project.
---

# Init command

The user has invoked `/INIT`. This sets up the NestJS Agent Pipeline for the current project.

Run each step below. If any step fails, report the error and continue with the remaining steps — partial setup is better than no setup.

## Step 1 — Validate project

1. Check that `package.json` exists and contains `@nestjs/core`. If not, warn the user: "This doesn't look like a NestJS project. The pipeline is designed for NestJS — some features may not work correctly. Continue anyway?"
2. Detect the NestJS version from `package.json` and note it.
3. Check that `.claude/agents/`, `.claude/hooks/`, `.claude/skills/nestjs/` all exist. If any are missing, the install may be incomplete — tell the user to re-run the install script.

## Step 2 — Verify hooks are executable

Run:
```bash
chmod +x .claude/hooks/*.sh .claude/hooks/*.py 2>/dev/null
```

Then verify the key hooks exist:
- `.claude/hooks/SEED-SESSION.sh`
- `.claude/hooks/ENRICH-PROMPT.py`
- `.claude/hooks/CLASSIFY-RISK.py`
- `.claude/hooks/BLOCK-SECRETS.py`
- `.claude/hooks/RESTRICT-BASH-TESTER.py`
- `.claude/hooks/RESTRICT-WRITE-CURATOR.py`
- `.claude/hooks/AUTO-FORMAT.sh`
- `.claude/hooks/GIT-HOTSPOTS.sh`

Report any missing hooks.

## Step 3 — Set up Repowise (optional but recommended)

Ask the user:
> "Repowise provides rich codebase intelligence (architecture wikis, risk scores, dead code detection) via MCP. It works best with an LLM API key."
>
> "Do you want to set up Repowise now?"
> - Yes, with OpenRouter (cheapest — uses models like Gemini Flash at ~$0.075/M tokens)
> - Yes, with Anthropic API (uses Claude — higher quality, higher cost)
> - Yes, with Ollama (local — zero API cost, needs local GPU)
> - Skip for now (the pipeline works without it; you can set it up later)

Based on their choice:

### OpenRouter
```bash
# Check for key
grep -q OPENROUTER_API_KEY .env 2>/dev/null && source <(grep OPENROUTER_API_KEY .env)

# If no key found, ask user to provide it
# Then initialize
repowise init --provider openrouter --model google/gemini-2.0-flash-001
```

### Anthropic
```bash
repowise init --provider anthropic --model claude-sonnet-4-6
```

### Ollama
```bash
# Check Ollama is running
curl -s http://localhost:11434/api/tags >/dev/null 2>&1 || echo "Ollama doesn't seem to be running"
repowise init --provider ollama --model llama3.1:8b
```

### Skip
Tell the user: "Repowise skipped. The pipeline will use the built-in context wikis (`.claude/context/`) and keyword-based risk classification. You can set up Repowise later by running `repowise init`."

## Step 4 — Generate initial wiki (if Repowise was configured)

If Repowise was set up in Step 3:

```bash
repowise generate
```

This takes 1-3 minutes depending on repo size. Tell the user what's happening: "Generating codebase wikis... This analyzes your source code, builds a dependency graph, and creates documentation pages."

After generation, verify it worked:
```bash
ls .repowise/wiki.db && echo "Wiki database created"
```

## Step 5 — Generate git hotspots

If this is a git repository with commit history:

```bash
bash .claude/hooks/GIT-HOTSPOTS.sh
```

Report: "Generated git hotspot data at `.claude/context/git-hotspots.json`."

If not a git repo or no commits yet: skip silently.

## Step 6 — Validate .gitignore

Check that `.gitignore` includes these entries. Add any that are missing:

```
.repowise/
.claude/openrouter-status.json
.claude/context/git-hotspots.json
.claude/audits/
```

## Step 7 — Summary

Report the final state:

```
NestJS Agent Pipeline — Setup Complete

Project: <project name from package.json>
NestJS:  v<version>
Branch:  <current git branch or "not a git repo">

Pipeline status:
  Agents:     ✓ 6 agents configured (CODER, REVIEWER, TESTER, CURATOR, MASTER, AUDITOR)
  Hooks:      ✓ <N> hooks active
  Skills:     ✓ NestJS skill loaded (SKILL.md, LLD.md, API-DESIGN.md, CLI.md, REVIEWER-CHECKLIST.md)
  Repowise:   ✓ configured / ✗ skipped
  Git data:   ✓ hotspots generated / ✗ no git history

How to use:
  - Just describe what you want to build — the pipeline routes automatically
  - /QUICK <task>  — fast-path for small changes
  - /AUDIT [scope] — full codebase audit
  - /MASTER <task> — for hard problems that need deep reasoning
```
