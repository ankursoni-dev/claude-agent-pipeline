#!/usr/bin/env bash
# SessionStart hook — seeds session with high-level project orientation.
#
# Stdout from SessionStart hooks is injected as Claude's context.
# Keep this BRIEF — every session pays this cost. ~300 tokens max.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CONTEXT_FILE="$PROJECT_DIR/.claude/context/CONTEXT.md"

# Detect NestJS version from package.json so agents don't guess
NEST_VERSION=""
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  NEST_VERSION=$(grep -oE '"@nestjs/core":[[:space:]]*"[^"]+"' "$PROJECT_DIR/package.json" 2>/dev/null \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
fi

# Detect git branch
BRANCH=""
if git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || true)
fi

# Check for Repowise MCP availability
REPOWISE_STATUS=""
if command -v repowise >/dev/null 2>&1; then
  if [[ -d "$PROJECT_DIR/.repowise" ]]; then
    REPOWISE_STATUS="available (indexed)"
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
Project type: NestJS backend service
${NEST_VERSION:+NestJS version (from package.json): $NEST_VERSION}
${BRANCH:+Current branch: $BRANCH}

Available subagents:
  - NESTJS-CODER: writes NestJS code AND tests (sonnet)
  - NESTJS-REVIEWER: read-only structural review, returns JSON verdict (sonnet)
  - NESTJS-TESTER: runs tests with verification ladder, returns JSON pass/fail (haiku)
  - CONTEXT-CURATOR: writes wiki to .claude/context/ (haiku)

Standard flow: coder -> typecheck/lint gate -> reviewer -> tester (risk-proportional) -> curator.
Reject early; tests are expensive.

Risk classification: <risk_tier> tag is injected per prompt (1=trivial, 2=contained, 3=cross-cutting).
  Tier 1 → /QUICK flow. Tier 2 → standard (skip curator unless public API changed). Tier 3 → full pipeline.

The 'nestjs' skill is preloaded for coder; condensed REVIEWER-CHECKLIST.md for reviewer.
Project conventions and per-module wikis are in .claude/context/.
${REPOWISE_STATUS:+
Repowise MCP: $REPOWISE_STATUS
  Use get_overview(), get_context(), get_risk() for codebase intelligence.}
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
