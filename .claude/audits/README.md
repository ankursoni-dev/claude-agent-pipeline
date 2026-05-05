# Audit Outputs

This directory holds the outputs of `/AUDIT` runs. Each audit gets its own timestamped subdirectory.

## Structure per audit

```
.claude/audits/<YYYY-MM-DD-HHMMSS>/
├── audit-meta.json          # timestamp, git SHA, branch, NestJS version, modules discovered
├── reviews/                 # per-module review files (one per module, written by AUDIT-REVIEWERs in parallel)
│   ├── users.md
│   ├── orders.md
│   └── ...
├── concern-analysis/        # cross-cutting analysis (security, transactions, tests, etc.)
│   ├── security.md
│   ├── transactions.md
│   └── ...
├── plan.md                  # remediation plan (Phase 3)
├── plan-approved.md         # plan after human approval/modifications (Phase 4)
├── execution-log.md         # what the pipeline did (Phase 5)
└── reports/                 # final deliverables (Phase 6)
    ├── security.md
    ├── code.md
    └── architecture.md
```

## Retention

These outputs accumulate over time. Keep the last few audits for reference; archive or delete older ones at your discretion. They're plain markdown — `git rm -r .claude/audits/<old-timestamp>/` is safe.

## Reading order for a completed audit

1. `reports/architecture.md` — system-level changes, before/now diagrams
2. `reports/security.md` — fixed and outstanding security issues
3. `reports/code.md` — per-module summary
4. `plan-approved.md` — what was decided
5. `concern-analysis/*.md` — deep cross-cutting findings
6. `reviews/*.md` — raw per-module findings (most detail, most volume)
