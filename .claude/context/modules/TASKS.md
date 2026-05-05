# Tasks Module

## Purpose
Provides a complete CRUD API for task management. Owns task lifecycle (creation, status transitions, deletion) and enforces business rules around task state changes. Designed as a reference implementation of the project's HTTP envelope conventions, dependency injection pattern, and DTO projection layer.

## Public API

### HTTP Endpoints
- `POST /v1/tasks` — create a new task; returns `{ data: TaskResponseDto }` (HTTP 201)
- `GET /v1/tasks?page=1&limit=20` — list tasks with pagination; returns `{ data: [...], meta: { page, limit, total } }` (HTTP 200)
- `GET /v1/tasks/:id` — fetch a single task; returns `{ data: TaskResponseDto }` (HTTP 200)
- `PATCH /v1/tasks/:id` — update task title or status; returns `{ data: TaskResponseDto }` (HTTP 200)
- `DELETE /v1/tasks/:id` — delete a task; returns no body (HTTP 204)

### Business Rules & Status Codes
- Cannot DELETE if task status is `in_progress` — returns HTTP 409 with `error: "TASK_IN_PROGRESS"` (machine code).
- Not found (GET/PATCH/DELETE on missing ID) — HTTP 404 with `error: "NOT_FOUND"`.
- Malformed `:id` (not a v4 UUID) — HTTP 400 with `error: "BAD_REQUEST"`. Enforced by `ParseUUIDPipe({ version: '4' })` on `findOne`, `update`, `remove`.
- Empty PATCH body (neither `title` nor `status`) — HTTP 422 with `error: "VALIDATION_FAILED"` and `errors[0] = { field: "body", message: ... }`. Enforced in the service layer.
- Validation failure (bad input shape, missing required fields) — HTTP 422 with `error: "VALIDATION_FAILED"` and `errors[]` array.
- All responses wrapped in standard envelope (see "Integration points" below).

### Task Data Model
- `id` — UUID, auto-generated
- `title` — required string
- `description` — optional string
- `status` — enum: `"todo" | "in_progress" | "done"`; defaults to `"todo"` on create
- `createdAt`, `updatedAt` — ISO strings, set by service

Note: `description` cannot be updated via PATCH (intentional; only `title` and `status` are patchable).

## Dependencies

### Internal
- None yet (this is the first module).

### External
- `@nestjs/common` — standard NestJS decorators (Controller, Get, Post, Patch, Delete, HttpCode, HttpStatus, Inject, Injectable, ConflictException, NotFoundException)
- `class-transformer` — `plainToInstance` for DTO projection

### Repository Injection Pattern
- Repository injected via symbol token `TASK_REPOSITORY` defined in `tasks.tokens.ts`.
- Allows swapping in-memory `Map<string, Task>` for a database-backed implementation without changing controller or service code.
- Repository implements `TaskRepository` interface defined in `task.interface.ts`.

## Key Decisions

### In-memory storage by design
The reference implementation uses `Map<string, Task>` in `tasks.repository.ts`. This is intentional and swappable — future teams can replace with a database without touching controller/service logic.

### DTO projection via plainToInstance
All responses go through `plainToInstance(TaskResponseDto, ...)` with `excludeExtraneousValues: true` to filter internal fields and enforce what clients see. This decouples entity shape from API contract.

### Description immutable after creation
PATCH endpoint only accepts `title` and `status` updates, not `description`. Reflects a product decision (not a code limitation) — see `UpdateTaskDto`. The immutability is reinforced by the project-wide `ValidationPipe` setting `forbidNonWhitelisted: true`, which rejects any unknown field (including `description`) on PATCH with 422.

### List order is insertion order
`InMemoryTaskRepository.findPage` iterates `Map<string, Task>`, which preserves insertion order. Pagination slicing therefore returns rows in the order tasks were created. Documented on the `TaskRepository.findPage` JSDoc.

### Repository owns paging
The `TaskRepository` interface exposes `findPage({ page, limit }): Page<Task>` rather than a bare `findAll(): Task[]`. The slice/total arithmetic lives in the repository so it can be pushed down into a database query (`LIMIT`/`OFFSET` or cursor) when storage is swapped. The service is a thin pass-through that only handles DTO projection.

### Defensive copies on read
`findPage`, `findById`, `create`, and `update` all return shallow clones of stored rows, so callers cannot mutate the underlying store by holding a reference. Verified by `tasks.repository.spec.ts`.

### 409 for in-progress deletion
Task service throws `ConflictException` with custom `error` field set to `"TASK_IN_PROGRESS"`. The global `HttpExceptionFilter` detects an all-uppercase, underscore-separated string in the exception body's `error` field and forwards it as the machine code; otherwise it falls back to the default HTTP phrase. This enables clients to parse errors programmatically.

## Integration Points

### Response Envelope
All single-object responses wrapped by global `ResponseInterceptor` (`demo/src/common/interceptors/response.interceptor.ts`):
- Service returns `TaskResponseDto`
- Interceptor wraps it as `{ data: TaskResponseDto }`
- Paginated responses already have `{ data, meta }` structure; interceptor passes them through.

### Error Envelope
All HTTP exceptions caught by global `HttpExceptionFilter` (`demo/src/common/filters/http-exception.filter.ts`):
- Standardized shape: `{ statusCode, error (machine code), message, timestamp, path }`. The `path` is `request.path`, so query strings (which can carry IDs/secrets) are stripped from error responses.
- Validation errors include `errors[]` array with field-level detail (HTTP 422 only).
- Services may also throw `HttpException` with a pre-built `errors: [{ field, message }]` array; the filter honors it directly without round-tripping through the class-validator string format.
- 5xx HTTP exceptions are logged at error level with stack via Nest's `Logger`.

### Catch-all 500 envelope
Anything that escapes `HttpExceptionFilter` is caught by `AllExceptionsFilter` (`demo/src/common/filters/all-exceptions.filter.ts`):
- Logs the original exception with stack at error level.
- Returns the standard envelope with `statusCode: 500`, `error: "INTERNAL_SERVER_ERROR"`, and a generic `message: "Internal server error"`. Internal exception messages are deliberately NOT echoed (leak risk).
- Filter order in `main.ts` / `configureApp`: `useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter())` — Nest applies filters right-to-left when matching, so `HttpExceptionFilter` (registered last) runs first, and `AllExceptionsFilter` is the broad fallback.

### Validation Pipeline
Global `ValidationPipe` in `main.ts` configured with:
- `whitelist: true, forbidNonWhitelisted: true` — rejects extra fields
- `transform: true` — coerces query params (strings) to numbers where the DTO expects them
- `errorHttpStatusCode: UNPROCESSABLE_ENTITY` (422)

Pagination query (page, limit) validated by `ListTasksQueryDto`; limit capped at 100.

## Files
- Module: `tasks.module.ts`, `tasks.controller.ts`, `tasks.service.ts`, `tasks.repository.ts`
- Tokens: `tasks.tokens.ts`
- Types & Interfaces: `task.interface.ts` (defines `Task`, `TaskStatus`, `PageRequest`, `Page<T>`, `TaskRepository`)
- DTOs: `dto/create-task.dto.ts`, `dto/update-task.dto.ts`, `dto/list-tasks-query.dto.ts`, `dto/task-response.dto.ts`
- Tests: `tasks.service.spec.ts`, `tasks.repository.spec.ts`, `test/tasks.e2e-spec.ts`

## Out of Scope
- Authentication & authorization (no user context yet).
- Persistent storage (in-memory only; no DB).
- Soft delete (DELETE is hard; tasks are removed completely).
- Filtering or sorting on list endpoint (only pagination).
