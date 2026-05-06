#!/usr/bin/env python3
"""
UserPromptSubmit hook — classifies change risk into tiers (keyword heuristics).

Tier 1 (Trivial): rename, typo, comment, config value, import reorder
Tier 2 (Contained): bug fix, DTO field, guard tweak, single-service change
Tier 3 (Cross-cutting): new module, new endpoint, transaction logic, dependency addition

Injects <risk_tier> tag into the conversation so the main session can route accordingly.

Zero LLM cost — pure keyword matching. If Repowise MCP is available, the main session
can use get_risk() for more accurate classification; this hook is the fast baseline.
"""

import json
import re
import sys

# Tier 1 keywords (trivial changes)
TIER_1_PATTERNS = re.compile(
    r"\b(rename|typo|comment|config|import|reorder|formatting|whitespace|"
    r"spelling|docstring|fix\s+typo|update\s+comment|add\s+comment|"
    r"cleanup|clean\s+up|lint|style)\b",
    re.IGNORECASE,
)

# Tier 3 keywords (cross-cutting changes)
TIER_3_PATTERNS = re.compile(
    r"\b(new\s+module|add\s+module|create\s+module|new\s+endpoint|"
    r"create\s+endpoint|add\s+endpoint|migration|transaction|"
    r"integrat(e|ion)|new\s+service|add\s+service|create\s+service|"
    r"stripe|payment|auth(entication|orization)?|database|"
    r"add\s+dependency|upgrade|websocket|queue|event|cron|schedule|"
    r"middleware|interceptor|guard|filter|pipe|"
    # Next.js cross-cutting
    r"new\s+page|add\s+page|create\s+page|new\s+route|"
    r"server\s+action|route\s+handler|layout|"
    r"new\s+component|add\s+component|create\s+component)\b",
    re.IGNORECASE,
)

# Code keywords — if NONE match, skip classification entirely
CODE_KEYWORDS = re.compile(
    r"\b(fix|add|update|modify|implement|refactor|bug|feature|"
    r"endpoint|service|module|config|build|create|remove|delete|"
    r"rename|controller|dto|guard|pipe|filter|interceptor|"
    # Next.js keywords
    r"page|component|layout|route|action|hook|nextjs|next\.js|"
    r"server\s+component|client\s+component|app\s+router)\b",
    re.IGNORECASE,
)


def classify(prompt: str) -> int:
    """Classify prompt into risk tier 1, 2, or 3."""
    # Check for Tier 3 first (higher priority)
    if TIER_3_PATTERNS.search(prompt):
        return 3

    # Check for Tier 1
    if TIER_1_PATTERNS.search(prompt):
        # But if it ALSO mentions Tier 3 concepts, upgrade
        return 1

    # Default to Tier 2
    return 2


def main():
    try:
        input_data = json.load(sys.stdin)
        prompt = input_data.get("prompt", "").strip()
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    # Skip if too short or not code-related
    if len(prompt) < 20 or not CODE_KEYWORDS.search(prompt):
        sys.exit(0)

    tier = classify(prompt)
    print(f"<risk_tier>{tier}</risk_tier>")
    sys.exit(0)


if __name__ == "__main__":
    main()
