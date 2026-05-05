#!/usr/bin/env python3
"""
PreToolUse hook — restricts the CONTEXT-CURATOR subagent's Write/Edit
tools to paths under .claude/context/ only.

Applied via matcher in settings.json: only fires when:
  - The tool is Write, Edit, or MultiEdit
  - The agent_type is 'CONTEXT-CURATOR'

Allowed paths:
  - .claude/context/CONTEXT.md
  - .claude/context/modules/*.md
  - .claude/context/decisions/*.md

Anything else is blocked. This is the second layer of defense; the first
is the agent prompt itself. Hooks are the enforcement.
"""
import json
import re
import sys

# Allowed: anything under .claude/context/ that ends in .md
ALLOWED_PATH = re.compile(r"(^|/)\.claude/context/[^/]+(/[^/]+)?\.md$")


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    # Only fire for the curator subagent
    agent_type = payload.get("agent_type") or ""
    if agent_type != "CONTEXT-CURATOR":
        sys.exit(0)

    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("file_path") or tool_input.get("path") or ""
    if not file_path:
        sys.exit(0)

    # Strip a literal leading "./" only — do NOT use lstrip("./"), which
    # would also strip leading dots from paths like ".claude/context/...".
    fp = re.sub(r"^\./", "", file_path)

    if ALLOWED_PATH.search(fp):
        sys.exit(0)

    print(
        f"BLOCKED: CONTEXT-CURATOR can only write under .claude/context/.\n"
        f"Got: {file_path}\n"
        f"Allowed: .claude/context/CONTEXT.md, .claude/context/modules/*.md, .claude/context/decisions/*.md\n"
        f"If you need to update code, this is a job for NESTJS-CODER, not the curator.",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
