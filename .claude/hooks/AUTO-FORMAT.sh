#!/usr/bin/env bash
# PostToolUse hook — auto-formats .ts and .tsx files after Write/Edit/MultiEdit.
#
# Runs prettier --write and eslint --fix on the file just modified.
# Silent on success; non-zero exit DOES NOT block (PostToolUse exit codes
# are advisory) — formatting failures should not stop the workflow,
# they should surface as warnings the coder can address.
#
# Reads the tool_input.file_path from stdin JSON.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Read JSON payload from stdin
PAYLOAD=$(cat)

# Extract file path (handle both file_path and path keys)
FILE_PATH=$(echo "$PAYLOAD" | python3 -c "
import json, sys
try:
    p = json.load(sys.stdin)
    ti = p.get('tool_input', {})
    print(ti.get('file_path') or ti.get('path') or '')
except Exception:
    print('')
")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only format TypeScript files
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Don't try to format files in node_modules, dist, or .git
case "$FILE_PATH" in
  */node_modules/*|*/dist/*|*/.git/*) exit 0 ;;
esac

# Use the project's local prettier/eslint via npx, with a 10s timeout each
# to avoid hanging the workflow on a misconfigured repo.
cd "$PROJECT_DIR" || exit 0

if [[ -f "package.json" ]]; then
  if command -v npx >/dev/null 2>&1; then
    timeout 10s npx --no-install prettier --write "$FILE_PATH" >/dev/null 2>&1 || true
    timeout 10s npx --no-install eslint --fix "$FILE_PATH" >/dev/null 2>&1 || true
  fi
fi

exit 0
