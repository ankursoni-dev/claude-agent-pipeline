#!/usr/bin/env bash
# SessionStart hook — seeds session with high-level project orientation.
#
# Stdout from SessionStart hooks is injected as Claude's context.
# Keep this BRIEF — every session pays this cost. ~200 tokens max.

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

cat <<EOF
<session_orientation>
Project type: NestJS backend service
${NEST_VERSION:+NestJS version (from package.json): $NEST_VERSION}
${BRANCH:+Current branch: $BRANCH}

Available subagents:
  - NESTJS-CODER: writes NestJS code AND tests (sonnet)
  - NESTJS-REVIEWER: read-only structural review, returns JSON verdict (sonnet)
  - NESTJS-TESTER: runs tests, returns JSON pass/fail (haiku)
  - CONTEXT-CURATOR: writes wiki to .claude/context/ (haiku)

Standard flow: coder -> reviewer -> tester -> curator -> reviewer (of wiki).
Reject early; tests are expensive.

The 'nestjs' skill is preloaded for coder + reviewer. See .claude/skills/nestjs/SKILL.md.
Project conventions and per-module wikis are in .claude/context/.
</session_orientation>
EOF

# If a CONTEXT.md exists, suggest reading it but don't dump it here —
# the UserPromptSubmit hook handles per-prompt injection.
if [[ -f "$CONTEXT_FILE" ]]; then
  echo ""
  echo "<note>Per-module context is injected automatically when prompts mention specific modules.</note>"
fi
