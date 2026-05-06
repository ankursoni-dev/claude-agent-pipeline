#!/usr/bin/env python3
"""
PreToolUse hook — restricts the NESTJS-TESTER subagent's Bash tool to
test execution commands only.

Applied via matcher in settings.json: only fires when:
  - The tool is Bash
  - The agent_type is 'NESTJS-TESTER'

Allowed command prefixes (after optional `cd` and `&&`):
  - npm test / npm run test*
  - npx jest ...
  - yarn test / yarn jest ...
  - pnpm test / pnpm jest ...
  - npm run lint, npm run typecheck (read-only validation, useful for tester)

Anything else is blocked.
"""
import json
import re
import sys

# Whitelist: each pattern matches the *whole* command (after any leading `cd ... &&`)
ALLOWED_PATTERNS = [
    re.compile(r"^(npm|yarn|pnpm)\s+(test|run\s+test\S*|run\s+lint|run\s+typecheck|run\s+build)(\s|$)"),
    re.compile(r"^(npm|yarn|pnpm)\s+exec\s+jest(\s|$)"),
    re.compile(r"^npx\s+jest(\s|$)"),
    re.compile(r"^npx\s+next\s+build(\s|$)"),                    # Next.js build check
    re.compile(r"^npx\s+vitest(\s|$)"),                           # Vitest (common in Next.js)
    re.compile(r"^npx\s+playwright(\s|$)"),                       # Playwright e2e
    re.compile(r"^npx\s+tsc\s+--noEmit(\s|$)"),                  # typecheck
    re.compile(r"^node\s+--experimental-vm-modules\s+.*jest"),    # ESM jest setups
    re.compile(r"^echo\s+"),                                      # debugging echo is fine
    re.compile(r"^cat\s+.*\.(json|md)$"),                         # reading config files
    re.compile(r"^ls(\s|$)"),
    re.compile(r"^pwd$"),
]


def strip_cd_prefix(cmd: str) -> str:
    """Strip leading `cd <dir> && ` so we can match against the actual command."""
    m = re.match(r"^cd\s+\S+\s+&&\s+(.+)$", cmd)
    return m.group(1) if m else cmd


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    # Only fire if this is a tester subagent (NestJS or Next.js)
    agent_type = payload.get("agent_type") or ""
    if agent_type not in ("NESTJS-TESTER", "NEXTJS-TESTER"):
        sys.exit(0)

    tool_input = payload.get("tool_input", {})
    command = (tool_input.get("command") or "").strip()
    if not command:
        sys.exit(0)

    # Reject obvious dangers regardless of whitelist match
    DANGER = re.compile(
        r"\b(rm\s+-rf|sudo|curl\s+.*\|\s*(sh|bash)|wget\s+.*\|\s*(sh|bash)|>\s*/dev/sd|mkfs|dd\s+if=)"
    )
    if DANGER.search(command):
        print(f"BLOCKED (danger): {command}", file=sys.stderr)
        sys.exit(2)

    # Check whitelist
    inner = strip_cd_prefix(command)
    for pattern in ALLOWED_PATTERNS:
        if pattern.match(inner):
            sys.exit(0)

    print(
        f"BLOCKED: Tester subagent can only run test/build/lint commands.\n"
        f"Got: {command}\n"
        f"Allowed: npm/yarn/pnpm test, npx jest/vitest/playwright, npx next build, npx tsc --noEmit.\n"
        f"If you need a setup step, ask the main session to delegate it to the appropriate CODER agent.",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
