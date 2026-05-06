---
description: First-run setup for the NestJS Agent Pipeline. Initializes Repowise, generates codebase wikis, validates hooks, and confirms the pipeline is ready. Run this once after installing the pipeline into a new project.
---

# Init command

The user has invoked `/INIT`. This sets up the NestJS Agent Pipeline for the current project.

Run each step below. If any step fails, report the error and continue with the remaining steps — partial setup is better than no setup.

## Step 1 — Validate project

1. Detect project type:
   - If `pnpm-workspace.yaml` or `turbo.json` exists: **monorepo**. Check for `apps/api/package.json` (NestJS) and `apps/web/package.json` (Next.js).
   - If `package.json` contains `@nestjs/core`: **standalone NestJS**.
   - If `package.json` contains `next`: **standalone Next.js**.
   - If none match, warn: "This project doesn't appear to use NestJS or Next.js. The pipeline is designed for these frameworks — some features may not work correctly. Continue anyway?"
2. Detect framework versions from the relevant `package.json` files and note them.
3. Check that `.claude/agents/`, `.claude/hooks/`, `.claude/skills/nestjs/`, `.claude/skills/nextjs/` all exist. If any are missing, the install may be incomplete — tell the user to re-run the install script.

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
> "Which provider do you want to use?"
> 1. **Gemini** (recommended — cheapest, fast, free tier available)
> 2. **OpenAI** (good quality, moderate cost)
> 3. **Anthropic** (highest quality, higher cost)
> 4. **Ollama** (local — zero API cost, needs local GPU)
> 5. **Skip for now** (the pipeline works without it; you can set it up later)

Based on their choice:

### Gemini
```bash
# Check for key
if [ -z "$GEMINI_API_KEY" ]; then
  echo "Get your Gemini API key at: https://aistudio.google.com/apikey"
  # Ask user to provide it
fi

repowise init --provider gemini --model gemini-2.0-flash
```

### OpenAI
```bash
# Check for key
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Get your OpenAI API key at: https://platform.openai.com/api-keys"
  # Ask user to provide it
fi

repowise init --provider openai --model gpt-4.1-mini
```

### Anthropic
```bash
# Check for key
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Get your Anthropic API key at: https://console.anthropic.com/settings/keys"
  # Ask user to provide it
fi

repowise init --provider anthropic --model claude-sonnet-4-6
```

### Ollama
```bash
# Check Ollama is running
curl -s http://localhost:11434/api/tags >/dev/null 2>&1 || echo "Ollama doesn't seem to be running"
repowise init --provider ollama --model llama3.2
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
repowise status 2>&1
```

Report the status output to the user — it shows page count, index health, and last sync time.

### Optional: Recommend `repowise watch` for active development

Tell the user:
> "For active development, you can run `repowise watch` in a separate terminal. This auto-updates wiki pages on every file save, so the pipeline always has fresh context. Without it, the pipeline runs `repowise update` after each successful task completion — which works fine but has a slight delay."
>
> ```bash
> # In a separate terminal, alongside Claude Code:
> repowise watch
> ```

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
.claude/repowise-status.json
.claude/context/git-hotspots.json
.claude/audits/
```

## Step 7 — Summary

Report the final state:

```
Agent Pipeline — Setup Complete

Project: <project name from package.json>
Type:    <monorepo | standalone NestJS | standalone Next.js>
NestJS:  v<version> (or "not detected")
Next.js: v<version> (or "not detected")
Branch:  <current git branch or "not a git repo">

Pipeline status:
  Agents:     ✓ 9 agents configured (NestJS: CODER/REVIEWER/TESTER, Next.js: CODER/REVIEWER/TESTER, CURATOR, MASTER, AUDITOR)
  Hooks:      ✓ <N> hooks active
  Skills:     ✓ NestJS skill loaded (SKILL.md, LLD.md, API-DESIGN.md, CLI.md, REVIEWER-CHECKLIST.md)
              ✓ Next.js skill loaded (SKILL.md, LLD.md, COMPONENT-DESIGN.md, REVIEWER-CHECKLIST.md)
  Repowise:   ✓ configured / ✗ skipped
  Git data:   ✓ hotspots generated / ✗ no git history

How to use:
  - Just describe what you want to build — the pipeline auto-detects NestJS vs Next.js
  - /QUICK <task>  — fast-path for small changes
  - /AUDIT [scope] — full codebase audit
  - /MASTER <task> — for hard problems that need deep reasoning
```
