#!/usr/bin/env bash
# SessionStart hook — seeds session with high-level project orientation.
#
# Stdout from SessionStart hooks is injected as Claude's context.
# Keep this BRIEF — every session pays this cost. ~300 tokens max.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CONTEXT_FILE="$PROJECT_DIR/.claude/context/CONTEXT.md"

# Detect monorepo structure
IS_MONOREPO=""
WORKSPACE_TOOL=""
if [[ -f "$PROJECT_DIR/pnpm-workspace.yaml" ]]; then
  IS_MONOREPO="yes"
  WORKSPACE_TOOL="pnpm"
elif [[ -f "$PROJECT_DIR/turbo.json" ]]; then
  IS_MONOREPO="yes"
  WORKSPACE_TOOL="turborepo"
fi

# Detect NestJS version (check apps/api/ first for monorepo, then root)
NEST_VERSION=""
if [[ -f "$PROJECT_DIR/apps/api/package.json" ]]; then
  NEST_VERSION=$(grep -oE '"@nestjs/core":[[:space:]]*"[^"]+"' "$PROJECT_DIR/apps/api/package.json" 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
elif [[ -f "$PROJECT_DIR/package.json" ]]; then
  NEST_VERSION=$(grep -oE '"@nestjs/core":[[:space:]]*"[^"]+"' "$PROJECT_DIR/package.json" 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
fi

# Detect Next.js version
NEXT_VERSION=""
if [[ -f "$PROJECT_DIR/apps/web/package.json" ]]; then
  NEXT_VERSION=$(grep -oE '"next":[[:space:]]*"[^"]+"' "$PROJECT_DIR/apps/web/package.json" 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
elif [[ -f "$PROJECT_DIR/package.json" ]]; then
  NEXT_VERSION=$(grep -oE '"next":[[:space:]]*"[^"]+"' "$PROJECT_DIR/package.json" 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
fi

# Detect git branch
BRANCH=""
if git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || true)
fi

# Check for Repowise MCP availability + freshness
REPOWISE_STATUS=""
REPOWISE_STALE_FILES=""
REPOWISE_STALE_COUNT=0
if command -v repowise >/dev/null 2>&1; then
  if [[ -d "$PROJECT_DIR/.repowise" ]]; then
    # Run dry-run update to get precise stale file list (fast, no LLM calls)
    REPOWISE_STALE_FILES=$(cd "$PROJECT_DIR" && timeout 10s repowise update --dry-run 2>&1 | head -20 || echo "")
    if [[ -n "$REPOWISE_STALE_FILES" ]] && echo "$REPOWISE_STALE_FILES" | grep -qiE "would (update|regenerate|sync)|stale|changed|modified|out.of.date"; then
      REPOWISE_STALE_COUNT=$(echo "$REPOWISE_STALE_FILES" | grep -cE "^\s*(- |  |\* )" || echo "some")
      REPOWISE_STATUS="indexed but STALE — run 'repowise update' before coding tasks that touch these files"
    else
      REPOWISE_STATUS="indexed and fresh"
    fi
  else
    REPOWISE_STATUS="installed but not indexed (run: repowise init)"
  fi
fi

# Check for git hotspot data
HOTSPOT_STATUS=""
HOTSPOT_FILE="$PROJECT_DIR/.claude/context/git-hotspots.json"
if [[ -f "$HOTSPOT_FILE" ]]; then
  HOTSPOT_STATUS="available"
fi

# Check for audit baseline
BASELINE_STATUS=""
BASELINE_FILE="$PROJECT_DIR/.claude/audits/baseline.json"
if [[ -f "$BASELINE_FILE" ]]; then
  BASELINE_STATUS="available"
fi

cat <<EOF
<session_orientation>
${IS_MONOREPO:+Project type: Monorepo ($WORKSPACE_TOOL)
  apps/api/  — NestJS backend
  apps/web/  — Next.js frontend
  packages/  — Shared code}
${IS_MONOREPO:-Project type: NestJS backend service}
${NEST_VERSION:+NestJS version: $NEST_VERSION}
${NEXT_VERSION:+Next.js version: $NEXT_VERSION}
${BRANCH:+Current branch: $BRANCH}

Available subagents:
  NestJS pipeline (apps/api/):
    - NESTJS-CODER: writes NestJS code + tests (sonnet)
    - NESTJS-REVIEWER: read-only structural review, NestJS checklist (sonnet)
    - NESTJS-TESTER: runs backend tests, verification ladder (haiku)
  Next.js pipeline (apps/web/):
    - NEXTJS-CODER: writes Next.js code + tests (sonnet)
    - NEXTJS-REVIEWER: read-only structural review, Next.js checklist (sonnet)
    - NEXTJS-TESTER: runs frontend tests + build checks (haiku)
  Shared:
    - CONTEXT-CURATOR: writes wiki to .claude/context/ (haiku)

Standard flow: coder -> typecheck/lint gate -> reviewer -> tester (risk-proportional) -> curator.
Reject early; tests are expensive.

Risk classification: <risk_tier> tag is injected per prompt (1=trivial, 2=contained, 3=cross-cutting).
  Tier 1 → /QUICK flow. Tier 2 → standard (skip curator unless public API changed). Tier 3 → full pipeline.

Each agent loads its framework-specific skill (nestjs or nextjs). Route to the right pipeline based on file paths.
Project conventions and per-module wikis are in .claude/context/.
${REPOWISE_STATUS:+
Repowise MCP: $REPOWISE_STATUS
  Query tools: get_overview(), get_context(), get_risk(), search_codebase(), get_why()
  Maintenance: run 'repowise update' after pipeline completes to keep wiki in sync.}
${REPOWISE_STALE_FILES:+
Repowise stale files (need update):
$REPOWISE_STALE_FILES}
${HOTSPOT_STATUS:+Git hotspot data: $HOTSPOT_STATUS (.claude/context/git-hotspots.json)}
${BASELINE_STATUS:+Audit baseline: $BASELINE_STATUS (.claude/audits/baseline.json — incremental audits enabled)}
</session_orientation>
EOF

# If a CONTEXT.md exists, mention it
if [[ -f "$CONTEXT_FILE" ]]; then
  echo ""
  echo "<note>Per-module context is injected automatically when prompts mention specific modules.</note>"
fi

# Regenerate git hotspots if stale (>1 day old) or missing
if git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  HOTSPOT_SCRIPT="$PROJECT_DIR/.claude/hooks/GIT-HOTSPOTS.sh"
  if [[ -f "$HOTSPOT_SCRIPT" ]]; then
    if [[ ! -f "$HOTSPOT_FILE" ]] || [[ $(find "$HOTSPOT_FILE" -mtime +1 2>/dev/null) ]]; then
      bash "$HOTSPOT_SCRIPT" >/dev/null 2>&1 &
    fi
  fi
fi
