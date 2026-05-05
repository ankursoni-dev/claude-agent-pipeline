---
description: Invoke the MASTER agent (opus) for tough, ambiguous, or open-ended work. Can request delegation to other agents — you must confirm each delegation with the user.
---

# MASTER command

The user has invoked `/MASTER`. Their task: `$ARGUMENTS`

Invoke the `MASTER` subagent. Pass it:

1. The user's task verbatim from `$ARGUMENTS`.

2. A note that this was invoked via `/MASTER`, signaling the user expects opus-grade engagement on something the standard pipeline didn't fit.

3. Reminder of the **delegation protocol**: MASTER can request delegation to other subagents, but YOU (the main session) must surface each delegation request to the user for approval before invoking. Do not auto-approve.

## How to handle MASTER's output

MASTER will produce one of three response shapes:

**Shape A: Self-contained answer** — design analysis, code, or diagnosis it did itself. Present to user as-is.

**Shape B: Delegation request(s)** — output blocks labelled `## DELEGATION REQUEST` with agent + task + files + acceptance criteria. For each:
  - Surface to the user with a clear prompt: "MASTER wants to delegate X to Y. Approve, modify, or reject?"
  - If approved, invoke the named agent with the requested task
  - Feed the result back to MASTER so it can continue

**Shape C: Mixed** — partial answer plus delegation requests. Present the answer first, then walk through delegations.

## Loop discipline

If MASTER and the user end up in a long back-and-forth (>5 turns), check in: "We've been on this for a while — should I summarize and have you make a final call, or continue?" Long MASTER sessions are the most expensive flow in this setup.
