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

- [tasks](modules/TASKS.md) — CRUD task management; reference implementation of HTTP envelope conventions and dependency injection pattern

## Architectural decisions

> ADRs live in `decisions/`. The curator adds an entry here per ADR.
> Format: `- [NNNN: Title](decisions/NNNN-slug.md) — one-line outcome`

_(no ADRs yet)_

## Key cross-cutting concerns

**Response envelope** — `ResponseInterceptor` (`demo/src/common/interceptors/response.interceptor.ts`) wraps single results in `{ data }` and passes through `{ data, meta }` paginated responses.

**Error envelope** — `HttpExceptionFilter` (`demo/src/common/filters/http-exception.filter.ts`) standardizes all HTTP errors as `{ statusCode, error (machine code), message, timestamp, path, errors? }`. Services can pass UPPER_SNAKE_CASE machine codes via exception body.

**Validation** — Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`; validation failures return 422 with per-field error detail.
