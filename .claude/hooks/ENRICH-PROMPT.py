#!/usr/bin/env python3
"""
UserPromptSubmit hook — deterministic context enrichment.

Reads the user prompt, greps `.claude/context/` for relevant wikis,
and injects matching content into the conversation as additional context.

This is a SHELL hook (zero LLM cost, deterministic). For prompts that need
genuine clarification (truly vague tasks), let the coder agent ask
follow-up questions itself rather than burning Haiku tokens here.

Trigger logic:
  - Always inject CONTEXT.md (the index) — small, cheap, orienting
  - Grep prompt for module names and decision slugs; inject matching wikis
  - For prompts under 30 chars or with no NestJS/code keywords, skip
    injection entirely (chat noise)
"""
import json
import os
import re
import sys
from pathlib import Path

CONTEXT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / ".claude" / "context"
MAX_INJECTED_BYTES = 8000  # cap to avoid blowing up the prompt

# Words that indicate the user is asking for code work; if NONE match,
# skip enrichment entirely.
CODE_KEYWORDS = re.compile(
    r"\b(implement|build|add|create|fix|refactor|review|test|endpoint|service|"
    r"controller|module|dto|guard|interceptor|pipe|filter|transaction|migration|"
    r"nestjs|nest|typescript|repository|inject)\b",
    re.IGNORECASE,
)


def read_input():
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def find_relevant_wikis(prompt: str):
    """Return list of (path, content) tuples for wikis whose filename
    appears as a token in the prompt."""
    if not CONTEXT_DIR.exists():
        return []

    prompt_lower = prompt.lower()
    matches = []

    # Scan modules/ and decisions/ for files whose stem appears in the prompt
    for sub in ("modules", "decisions"):
        sub_dir = CONTEXT_DIR / sub
        if not sub_dir.exists():
            continue
        for md in sub_dir.glob("*.md"):
            stem = md.stem.lower()
            # match either the full stem or a primary word from it
            primary_word = re.split(r"[-_]", stem)[0]
            if stem in prompt_lower or (len(primary_word) >= 4 and primary_word in prompt_lower):
                try:
                    rel = md.relative_to(CONTEXT_DIR.parent.parent)
                    matches.append((str(rel), md.read_text(encoding="utf-8")))
                except OSError:
                    pass
    return matches


def main():
    payload = read_input()
    prompt = payload.get("prompt", "")

    # Skip enrichment for non-code chat
    if len(prompt.strip()) < 30 or not CODE_KEYWORDS.search(prompt):
        sys.exit(0)

    # Always include CONTEXT.md if it exists (small, orienting)
    output_chunks = []
    index_path = CONTEXT_DIR / "CONTEXT.md"
    if index_path.exists():
        try:
            output_chunks.append(
                "<context_index path='.claude/context/CONTEXT.md'>\n"
                f"{index_path.read_text(encoding='utf-8')}\n"
                "</context_index>"
            )
        except OSError:
            pass

    # Add matching wikis
    for path, content in find_relevant_wikis(prompt):
        output_chunks.append(
            f"<context_wiki path='{path}'>\n{content}\n</context_wiki>"
        )

    if not output_chunks:
        sys.exit(0)

    output = "\n\n".join(output_chunks)

    # Cap total injection size
    if len(output) > MAX_INJECTED_BYTES:
        output = output[:MAX_INJECTED_BYTES] + "\n\n[... truncated for size ...]"

    # Stdout from UserPromptSubmit hooks is added to context
    print(output)
    sys.exit(0)


if __name__ == "__main__":
    main()
