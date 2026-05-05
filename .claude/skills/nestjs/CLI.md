# NestJS CLI — Scaffolding & Project Setup

> Use this file when generating new NestJS code via the CLI or bootstrapping a project.

---

## 1. Install

```bash
npm i -g @nestjs/cli
nest --version
```

---

## 2. Create a new project

```bash
nest new <name>
```

Useful flags:

| Flag | When to use |
|---|---|
| `--package-manager <npm\|yarn\|pnpm>` | Lock to one PM up front |
| `--strict` | Always — enables strict TypeScript |
| `--skip-git` | Bootstrapping inside an existing repo |
| `--skip-install` | CI / scripted setups |

---

## 3. Generate code — the canonical command

For a new feature module with full CRUD scaffolding, use **one** command:

```bash
nest g resource <name>
```

Aliases: `nest g res <name>`. Prompts for transport (REST / GraphQL / Microservice) and whether to generate CRUD endpoints.

Output:
```
src/<name>/
  dto/
    create-<name>.dto.ts
    update-<name>.dto.ts
  entities/
    <name>.entity.ts
  <name>.controller.ts
  <name>.service.ts
  <name>.module.ts
  <name>.controller.spec.ts
  <name>.service.spec.ts
```

The CLI also wires the new module into `app.module.ts` automatically.

---

## 4. Generate individual artifacts

| Schematic | Alias | When |
|---|---|---|
| `module` | `mo` | New feature folder; usually use `resource` instead |
| `controller` | `co` | Adding a controller to an existing module |
| `service` | `s` | Adding a sibling service in an existing module |
| `guard` | `gu` | Auth, RBAC, request-time access checks |
| `interceptor` | `in` | Logging, response shaping, caching, timing |
| `pipe` | `pi` | Custom validation or transformation |
| `filter` | `f` | Custom exception → HTTP mapping |
| `middleware` | `mi` | Pre-controller request mutation (rare; prefer interceptor) |
| `decorator` | `d` | Custom param or method decorators |
| `gateway` | `ga` | WebSocket gateway |
| `resolver` | `r` | GraphQL resolver |
| `class` | `cl` | DTO, entity, plain class |
| `interface` | `itf` | Domain interface |
| `enum` | `e` | Shared enum |

Syntax: `nest g <schematic> <name>` — e.g. `nest g gu auth`.

---

## 5. CLI flags that matter

| Flag | Effect | When to use |
|---|---|---|
| `--no-spec` | Skip `.spec.ts` test stub | When you'll write tests by hand |
| `--flat` | Don't create a wrapper folder | When generating into an existing folder structure |
| `--dry-run` | Preview file changes without writing | Always, the first time you run an unfamiliar generator |
| `--project <name>` | Target a specific app/lib in a monorepo | Required in monorepo mode |

Example:
```bash
nest g resource users --no-spec --dry-run
```

---

## 6. Run / build

| Action | Command |
|---|---|
| Dev (watch mode) | `npm run start:dev` |
| Debug (watch + inspector) | `npm run start:debug` |
| Production build | `npm run build` |
| Run built artifact | `npm run start:prod` |

For Webpack-based bundling on large projects:
```bash
nest start --webpack --watch
```

---

## 7. Tests

| Action | Command |
|---|---|
| Run unit tests | `npm run test` |
| Watch mode | `npm run test:watch` |
| Coverage report | `npm run test:cov` |
| E2E tests | `npm run test:e2e` |

E2E tests live in `/test`, separate from unit tests in `src/`.

---

## 8. Monorepo

NestJS supports first-class monorepo (`apps/` + `libs/`).

### Create a monorepo from scratch

```bash
nest new <org-name> --monorepo
```

### Convert an existing single-project repo

```bash
nest g app <new-app-name>
```

### Add an additional app or library

```bash
nest g app <name>           # apps/<name> — new deployable
nest g library <name>       # libs/<name> — shared code
```

### Generate code into a specific project

```bash
nest g resource users --project <app-name>
```

### Typical monorepo layout

```
apps/
  api-gateway/
  worker-service/
libs/
  common/         # shared DTOs, decorators, exception types
  database/       # ORM setup, base repository
  auth/           # shared auth strategy, guards
```

Use a monorepo only when you have ≥2 deployables that share code. For a single service, the standard `src/` layout is correct.

---

## 9. Typical npm scripts (CLI-generated)

```json
{
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:debug": "nest start --debug --watch",
  "start:prod": "node dist/main",
  "build": "nest build",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:cov": "jest --coverage",
  "test:e2e": "jest --config ./test/jest-e2e.json"
}
```

Treat these as defaults — extend, don't replace.

---

## 10. Quick workflow reference

| Goal | Command |
|---|---|
| New app | `nest new my-app --strict` |
| New full CRUD feature | `nest g resource <name>` |
| New guard | `nest g gu <name>` |
| New interceptor | `nest g in <name>` |
| Preview before generating | append `--dry-run` |
| Skip test stubs | append `--no-spec` |
| Dev server | `npm run start:dev` |
| Production build | `npm run build && node dist/main` |
| Coverage | `npm run test:cov` |

---

## 11. What the CLI will not do for you

Handle these yourself:

- Wire env validation (use `@nestjs/config` with a Joi or Zod schema)
- Set up the global `ValidationPipe` in `main.ts`
- Configure database connection pooling
- Add Helmet, CORS, rate limiting
- Set up Swagger / OpenAPI documentation
- Configure structured logging (Pino / Winston)
- Set up Dockerfile, CI, deployment

The CLI scaffolds modules and files. Production-ready bootstrapping is your responsibility.
