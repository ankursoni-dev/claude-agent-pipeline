# Standard Pipeline Flow

Default flow for any "implement X" / "fix Y" / "refactor Z" prompt that isn't explicitly routed elsewhere.

The order is **CODE → REVIEW → TEST → CURATE** — not CODE → TEST → REVIEW. Static review is cheap (sonnet, read-only); tests are expensive (DB, network). Reject early, reject cheap.

```mermaid
flowchart TD
    User([User prompt])

    Hook["UserPromptSubmit hook<br/>ENRICH-PROMPT.py injects relevant context wikis"]
    Main{{Main session orchestrator}}

    Coder["NESTJS-CODER<br/>sonnet — full tools<br/>writes code + tests"]
    Reviewer["NESTJS-REVIEWER<br/>sonnet — read-only<br/>structural review"]
    Tester["NESTJS-TESTER<br/>haiku — bash whitelisted<br/>runs npm test"]
    Curator["CONTEXT-CURATOR<br/>haiku — write restricted<br/>to .claude/context/"]
    WikiReviewer["NESTJS-REVIEWER<br/>reviewing wiki this time"]

    ReviewGate{Verdict?}
    LoopCheck1{"Coder loop<br/>less than 3 rounds?"}
    Escalate1["Escalate to user<br/>with reviewer JSON<br/>+ coder summary"]

    TestGate{Passed?}
    LoopCheck2{"Tester loop<br/>less than 2 rounds?"}
    Escalate2["Escalate to user"]

    CuratorCheck{"Touched public API<br/>surface or architecture?"}
    WikiGate{Verdict?}

    Done([Report success])

    User --> Hook
    Hook --> Main

    Main -->|delegate| Coder
    Coder -->|files + summary| Main

    Main -->|delegate| Reviewer
    Reviewer -->|JSON verdict| ReviewGate

    ReviewGate -->|rejected + issues| LoopCheck1
    LoopCheck1 -->|yes| Coder
    LoopCheck1 -->|no| Escalate1

    ReviewGate -->|approved| Tester
    Tester -->|JSON pass/fail| TestGate

    TestGate -->|failed + failures| LoopCheck2
    LoopCheck2 -->|yes| Coder
    LoopCheck2 -->|no| Escalate2

    TestGate -->|passed| CuratorCheck

    CuratorCheck -->|no| Done
    CuratorCheck -->|yes| Curator

    Curator -->|wiki diff| WikiReviewer
    WikiReviewer -->|JSON verdict| WikiGate

    WikiGate -->|rejected| Curator
    WikiGate -->|approved| Done

    classDef agent fill:#e1f5ff,stroke:#0288d1,stroke-width:2px,color:#000
    classDef gate fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#000
    classDef escalate fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#000
    classDef done fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000

    class Coder,Reviewer,Tester,Curator,WikiReviewer agent
    class ReviewGate,TestGate,CuratorCheck,WikiGate,LoopCheck1,LoopCheck2 gate
    class Escalate1,Escalate2 escalate
    class Done done
```

## Loop budgets

- Coder ↔ Reviewer: **max 3 rounds** before escalation to user.
- Coder ↔ Tester: **max 2 rounds** before escalation to user.

## When steps are skipped

| Task type | Coder | Reviewer | Tester | Curator |
|---|---|---|---|---|
| New feature | ✅ | ✅ | ✅ | ✅ |
| Bug fix (with regression test) | ✅ | ✅ | ✅ | ❓ skip if module-API unchanged |
| Refactor (no behaviour change) | ✅ | ✅ | ✅ | ❌ |
| Doc-only change | ✅ | ❌ | ❌ | ❌ |
| Test-only addition | ✅ | ✅ | ✅ | ❌ |
| Config / dependency bump | ✅ | ✅ | ✅ (full suite) | ❌ |
