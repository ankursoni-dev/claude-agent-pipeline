# Fast-Path Flow (`/QUICK`)

For small changes — renames, parameter tweaks, signature adjustments, comment updates. Skips the full pipeline. Coder makes the change; reviewer judges whether tests / full pipeline / curator are needed.

```mermaid
flowchart TD
    User([User prompt with<br/>/QUICK or quick: prefix]) --> Main{{Main session}}

    Main --> SizeCheck{Looks small?}
    SizeCheck -->|"too big<br/>(e.g. 'add Stripe')"| Surface[Surface to user:<br/>'Want full pipeline instead?']
    Surface --> User
    SizeCheck -->|yes| Coder[NESTJS-CODER<br/>makes the change<br/>no new tests unless<br/>new code path created]

    Coder -->|files + summary| Reviewer[NESTJS-REVIEWER<br/>verdict + 2 extra fields:<br/>recommend_full_pipeline<br/>recommend_tests]

    Reviewer --> Verdict{Verdict?}
    Verdict -->|rejected| Coder

    Verdict -->|approved| Branch{Reviewer<br/>recommendation}

    Branch -->|recommend_full_pipeline = true| FullPipeline[Escalate to<br/>STANDARD PIPELINE<br/>full coder→reviewer→tester→curator]
    Branch -->|recommend_tests = true only| Tester[NESTJS-TESTER<br/>runs scoped tests]
    Branch -->|neither| ApiCheck{Altered public API<br/>or architectural<br/>decision?}

    Tester --> TestGate{Passed?}
    TestGate -->|failed| Coder
    TestGate -->|passed| ApiCheck

    ApiCheck -->|no| Done([Report success])
    ApiCheck -->|yes| Curator[CONTEXT-CURATOR<br/>updates wiki]
    Curator --> WikiReview[NESTJS-REVIEWER<br/>reviews wiki diff]
    WikiReview --> WikiVerdict{Verdict?}
    WikiVerdict -->|rejected| Curator
    WikiVerdict -->|approved| Done

    classDef agent fill:#e1f5ff,stroke:#0288d1,stroke-width:2px,color:#000
    classDef gate fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#000
    classDef escalate fill:#fff9c4,stroke:#f9a825,stroke-width:2px,color:#000
    classDef done fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000

    class Coder,Reviewer,Tester,Curator,WikiReview agent
    class SizeCheck,Verdict,Branch,TestGate,ApiCheck,WikiVerdict gate
    class Surface,FullPipeline escalate
    class Done done
```

## Reviewer's extra responsibility on `/QUICK`

On a fast-path review, the reviewer's JSON includes two extra fields beyond the usual verdict:

```json
{
  "verdict": "approved",
  "issues": [],
  "recommend_full_pipeline": false,
  "recommend_tests": false,
  "summary": "Pure rename, no new behaviour"
}
```

The main session reads these to decide whether to escalate, run tests only, or stop.

## When to honour `/QUICK` vs. surface a question

| Looks like… | Action |
|---|---|
| Rename / parameter tweak / signature adjust | honour `/QUICK` |
| Comment / log message update | honour `/QUICK` |
| New endpoint / new module / new dependency | surface — recommend standard pipeline |
| Bug fix that needs a regression test | honour `/QUICK` initially; reviewer will flag `recommend_tests=true` |
