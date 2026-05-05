# Project Context — Index

> This file is the index that orients agents to the codebase. It is automatically injected into every code-related prompt by the `ENRICH-PROMPT.py` hook, so keep it concise — under ~100 lines.
>
> The **CONTEXT-CURATOR** subagent maintains this file and the per-module wikis under `modules/`. Other agents read it but do not write it.

## Project at a glance

- **Type**: NestJS backend service
- **Runtime**: Node.js (LTS) + TypeScript
- **Framework**: NestJS v11.x (verify in `package.json`)

> Replace this section as the project takes shape — add the real DB, ORM, queue, auth strategy, deployment target, etc.

## Conventions in this codebase

- Response envelope follows `.claude/skills/nestjs/SKILL.md` (universal section).
- Validation: global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`.
- Error envelope: `{ statusCode, error (machine code), message, timestamp, path }`.
- Versioning: URI (`/v1/...`).
- All atomic writes: single transaction. External side effects: outbox pattern.

## Modules

> The curator adds an entry here for each module under `modules/`.
> Format: `- [name](modules/<name>.md) — one-line purpose`

_(no modules documented yet — the curator will populate this as features ship)_

## Architectural decisions

> ADRs live in `decisions/`. The curator adds an entry here per ADR.
> Format: `- [NNNN: Title](decisions/NNNN-slug.md) — one-line outcome`

_(no ADRs yet)_

## Key cross-cutting concerns

> Fill in as cross-cutting infrastructure is implemented:
> - **Response envelope** — which interceptor, where it lives
> - **Error envelope** — which filter, the standard shape
> - **Validation** — global pipe config, 422 detail format
