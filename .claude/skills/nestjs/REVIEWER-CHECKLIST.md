# NestJS Reviewer Checklist (Condensed)

> Extracted from LLD.md §16 + SKILL.md universal defaults. This is the reviewer's working reference — not the full design spec.

## Severity Rules

- **blocker**: Code is unsafe, broken, or violates a hard rule. Auto-reject.
  - No validation on input, raw entity returned, @Res() injected, transaction missing for atomic writes, no tests for new public method, business logic in controller

- **major**: Violates a principle but works. Reject if 2+ majors.
  - SoC leak, LoD violation, fat service (>150 lines), missing timeout on outbound call, no idempotency key on non-idempotent POST

- **minor**: Style, naming, redundant imports. Report but don't block.

## Response Envelope (must conform)

| Case | Shape |
|---|---|
| Success (single) | `{ "data": { ... } }` |
| Success (paginated) | `{ "data": [], "meta": { "page", "limit", "total" } }` |
| Error | `{ "statusCode", "error" (machine code), "message", "timestamp", "path" }` |
| Validation (422) | adds `"errors": [{ "field", "message" }]` |

## Checklist

### Structure & Layering
- [ ] Each class has single responsibility; services < 150 lines, controllers < 100
- [ ] Controller: parse input → call service → return DTO. Zero business logic.
- [ ] Service: business logic only. No @Req(), @Res(), HTTP status codes.
- [ ] Repository: DB queries only. No business rules.
- [ ] Module exports only what's necessary

### DI & Coupling
- [ ] No `new ConcreteClass()` in services/controllers
- [ ] Interface-based injection via Symbol tokens
- [ ] Dependencies swappable in tests

### Contract Correctness
- [ ] Response DTO separate from entity; `plainToInstance()` projection used
- [ ] Error envelope conforms to standard shape above
- [ ] Status codes correct: 200/201/204 success; 400 (parse) vs 422 (validation) distinguished
- [ ] Pagination returns `{ data, meta: { page, limit, total } }`
- [ ] New routes are versioned

### Transactions & Resilience
- [ ] Atomic writes in single transaction
- [ ] No external HTTP/queue calls inside transaction blocks
- [ ] Outbound calls have explicit timeouts
- [ ] Retries bounded; non-idempotent writes have idempotency keys
- [ ] Infrastructure exceptions mapped to domain exceptions

### Tests
- [ ] Every new public service method: unit test (happy + failure branches)
- [ ] Every new controller route: e2e test (status code + envelope)
- [ ] **Every new endpoint: at least one negative test (malformed input → 400/422, not-found → 404, or business rule violation → 409/422)**
- [ ] Mocks are injected deps, not the SUT
- [ ] No implementation-detail assertions

### Hygiene
- [ ] No @ts-ignore or `as any` without justifying comment
- [ ] No empty catch blocks
- [ ] No commented-out code
- [ ] No console.log in production paths

## Audit-Mode Extensions

When invoked with `mode: audit`, also check:
- [ ] Cross-module dependency hygiene (no circular imports, no reaching into another module's internals)
- [ ] Dead code: unused exports, unreachable files
- [ ] Test coverage completeness (not just new tests — all public methods)
- [ ] Return expanded JSON with: `"cross_module_concerns": [...]`, `"test_coverage_gaps": [...]`
