# MASTER Flow (`/MASTER`)

For tough, ambiguous, or open-ended problems — deep architecture decisions, cross-module debugging, novel design problems, or stalled standard-pipeline loops. MASTER (opus) reasons through the problem and either self-contains the answer or asks the main session to delegate sub-tasks. **MASTER never invokes other subagents directly** — every delegation request is gated by user approval.

```mermaid
flowchart TD
    User([User prompt with /MASTER<br/>or escalation from<br/>stalled pipeline]) --> Main{{Main session}}

    Main -->|delegate task| Master[MASTER<br/>opus — full tools incl. Task<br/>generalist deep-reasoning]

    Master --> Shape{Response shape}

    Shape -->|A. Self-contained answer| SelfContained[Returns design /<br/>code / diagnosis<br/>done itself]
    SelfContained --> Present1[Main session presents<br/>answer to user]
    Present1 --> Done([Done])

    Shape -->|B. Delegation request s| DelReq[/Output blocks:<br/>## DELEGATION REQUEST<br/>Agent: NESTJS-CODER ...<br/>Task: ...<br/>Files: ...<br/>Acceptance: .../]

    DelReq --> Surface[Main session surfaces<br/>each request to user:<br/>'MASTER wants to delegate<br/>X to Y. Approve?']

    Surface --> UserGate{User decides}
    UserGate -->|reject| BackToMaster1[Feed rejection<br/>back to MASTER]
    UserGate -->|modify| Modified[User edits the<br/>delegation request]
    UserGate -->|approve| InvokeAgent[Main session invokes<br/>named subagent<br/>with approved task]

    Modified --> InvokeAgent
    InvokeAgent --> AgentResult[Subagent returns<br/>result]
    AgentResult --> BackToMaster2[Feed result<br/>back to MASTER]

    BackToMaster1 --> Master
    BackToMaster2 --> Master

    Shape -->|C. Mixed| Mixed[Partial answer<br/>+ delegation requests]
    Mixed --> Present2[Present partial<br/>answer to user]
    Present2 --> DelReq

    Master -.->|long back-and-forth<br/>>5 turns| CheckIn[Main session checks in:<br/>'Should I summarize and<br/>have you make the call?']
    CheckIn --> User

    classDef agent fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000
    classDef gate fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#000
    classDef human fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
    classDef done fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000

    class Master,InvokeAgent agent
    class Shape,UserGate gate
    class Surface,Present1,Present2,CheckIn,Modified human
    class Done done
```

## Why the delegation gate matters

MASTER runs on opus and can request work from any standard agent. Without the gate:
- A single MASTER call could trigger dozens of opus + sonnet calls without user awareness.
- The user loses visibility into cost and direction.
- The "stalled pipeline rescue" use case becomes another runaway loop.

The gate keeps the user in the loop on every cost-significant delegation.

## When MASTER does the work itself vs. delegates

| Situation | MASTER's action |
|---|---|
| Reading code to understand it | does it itself |
| Designing a new module's structure | does it itself |
| Writing the actual code for that module | delegates to NESTJS-CODER |
| Reviewing tricky code | does it itself if regular reviewer already approved |
| Running tests | always delegates to NESTJS-TESTER |
| Updating wikis | delegates to CONTEXT-CURATOR |
| Debugging a hard runtime issue | does it itself |
| Researching unfamiliar library | does it itself with WebFetch / WebSearch |

The rule: judgment work stays with MASTER; mechanical work delegates.

## Output shapes MASTER uses

| Task type | Expected MASTER output |
|---|---|
| Design questions | reasoning + recommendation + delegation requests for implementation |
| Hard bugs | diagnosis + fix (or delegation request) + how to prevent recurrence |
| Architecture work | mermaid diagram + explanation + file/module skeleton |
| Stalled-loop rescue | why it stalled + what to do differently + fresh delegation request |

Every MASTER response ends with a `## What's next` section listing concrete next actions and owners.
