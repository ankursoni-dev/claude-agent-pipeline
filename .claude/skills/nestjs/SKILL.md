---
name: nestjs
description: Use this skill for any task involving NestJS code — writing services, controllers, modules, or DTOs; designing REST API endpoints; scaffolding new modules or resources via the Nest CLI; reviewing NestJS code for SOLID, DRY, transactions, resilience, or test discipline. Triggers on mentions of NestJS, `@nestjs/`, `nest g`, `nest new`, or any NestJS-style decorator (`@Controller`, `@Injectable`, `@Module`, `@UseGuards`, etc.). Does NOT trigger for generic Node.js, Express, or Fastify work without explicit NestJS context.
---

# NestJS Backend Engineering

## When to use this skill

Apply this skill to any of:

- Writing or reviewing NestJS service / controller / module / DTO code
- Designing a new REST endpoint contract (HTTP verb, route shape, status codes, error envelope, pagination)
- Scaffolding code via the Nest CLI (`nest g ...`, `nest new`)
- Code review of NestJS files for architectural correctness

Do NOT apply for plain Node.js, Express, or Fastify work that doesn't import `@nestjs/...`.

---

## Routing — read the matching sub-file

This skill is split into three sub-files. Read the file(s) that match the task. Multiple may apply.

| Task signal | Sub-file |
|---|---|
| Reviewing or writing service/controller/module/DTO code; applying SOLID, DRY, KISS, LoD, encapsulation, error handling, transactions, resilience, tests | `LLD.md` |
| Designing a new endpoint contract — choosing HTTP verb, route shape, status code, query/body/header placement, response envelope, pagination | `API-DESIGN.md` |
| Generating new code via `nest g ...`, bootstrapping a project with `nest new`, or setting up monorepo structure | `CLI.md` |

Worked examples:

- **"Add a `POST /users/:id/avatar` endpoint that uploads an image"** → `API-DESIGN.md` (contract — verb, status, multipart, error codes) + `LLD.md` (service layer, file storage as injected dep, transactions if metadata is persisted)
- **"Review this `OrderService`"** → `LLD.md` only
- **"Scaffold a new `payments` module"** → `CLI.md` first, then `LLD.md` once code exists
- **"Why is this returning 500 instead of 422?"** → `API-DESIGN.md` (status code semantics) + `LLD.md` (§11 error handling, §13 resilience for infrastructure errors)

---

## Universal defaults — apply regardless of sub-file

These hold across every task; the sub-files assume them and don't repeat them.

### Framework version

Assume **NestJS v11.x** unless the project's `package.json` specifies otherwise. Some idioms in the sub-files (e.g. `IntrinsicException`, JSON-mode `ConsoleLogger`) are v11-specific — verify before using on older codebases.

### `main.ts` baseline

Every NestJS app must boot with these globals. Treat as a precondition for everything in the sub-files.

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,             // strip unknown properties
    forbidNonWhitelisted: true,  // 400 on unknown properties
    transform: true,             // auto-convert primitives per DTO type
    transformOptions: { enableImplicitConversion: true },
  }));

  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
  app.enableVersioning({ type: VersioningType.URI });

  await app.listen(process.env.PORT ?? 3000);
}
```

### Layer responsibilities (non-negotiable)

| Layer | Owns | Forbidden |
|---|---|---|
| Controller | HTTP parsing, calling service, projecting to response DTO | Business logic, DB access, `@Res()` injection (except streaming) |
| Service | Domain/business logic | HTTP concepts (status codes, headers), `@Req()`, `Response` |
| Repository | DB queries | Business rules, HTTP awareness |

Crossing these lines is a code-review reject. See `LLD.md` §7 for full enforcement.

### Response envelope (the single contract)

| Case | Shape |
|---|---|
| Success (single) | `{ "data": { ... } }` |
| Success (paginated) | `{ "data": [ ... ], "meta": { "page", "limit", "total" } }` |
| Error (any) | `{ "statusCode", "error" (machine code), "message", "timestamp", "path" }` |
| Error (422 validation extension) | adds `"errors": [{ "field", "message" }]` |

This is the same envelope used in `LLD.md` §11 and `API-DESIGN.md`. They are deliberately identical — when in doubt, conform.

### Project layout

```
src/
  common/           # shared decorators, filters, guards, interceptors, pipes
  config/           # @nestjs/config setup, env schema validation
  database/         # ORM bootstrap, migrations, base repository interface
  modules/
    <feature>/
      dto/                       # request + response DTOs (separate)
      entities/                  # ORM entities / schemas
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.module.ts
      <feature>.repository.ts    # if using repository pattern
  main.ts
```

Deviate only with documented reason. Monorepo structure differs — see `CLI.md` §Monorepo.

### Never do

- Return raw ORM entities from a controller. Always project via `plainToInstance(ResponseDto, entity)`.
- Inject concrete repository classes into services. Inject via interface + `Symbol` token (see `LLD.md` §1.5).
- Throw raw infrastructure errors (`AxiosError`, `MongoError`, `RedisError`) from services. Map to domain exceptions (see `LLD.md` §11, §13).
- Skip `ValidationPipe`. It is the boundary fail-fast.
- Mix transaction strategies in one project (see `LLD.md` §12).
