# Low-Level Design — Code Writing & Review Reference

> **Purpose**: Authoritative reference for writing or reviewing NestJS code.
> Apply these rules to every file touched. Flag every violation found during review.
> **Framework context**: NestJS v11.x.

---

## How to use this document

- **Writing code**: check each principle before committing any class, function, or module.
- **Reviewing code**: scan each section top-to-bottom; raise a finding for every violation.
- **Status legend**:
  - `[NEST: ENFORCED]` — NestJS architecture makes compliance near-automatic.
  - `[NEST: PARTIAL]` — NestJS provides scaffolding but discipline is still required.
  - `[NEST: MANUAL]` — NestJS has no opinion; the developer must enforce.

---

## 1. SOLID Principles

### 1.1 Single Responsibility (SRP)

**Rule**: Every class has exactly one reason to change. One class = one concern.

**Smell signals**: class name contains `And`, `Manager`, `Handler`, `Util`; file > ~150 lines; multiple unrelated imports.

```typescript
// ❌ VIOLATION — UserService does three jobs
@Injectable()
export class UserService {
  createUser(dto: CreateUserDto) { /* ... */ }
  sendWelcomeEmail(user: User) { /* nodemailer logic */ }
  generatePdfReport(users: User[]) { /* pdf logic */ }
}

// ✅ CORRECT — each class owns one concern
@Injectable()
export class UserService {
  createUser(dto: CreateUserDto): Promise<User> { /* ... */ }
}

@Injectable()
export class UserEmailService {
  sendWelcome(user: User): Promise<void> { /* nodemailer */ }
}

@Injectable()
export class UserReportService {
  generatePdf(users: User[]): Buffer { /* pdf */ }
}
```

**NestJS coverage** `[NEST: PARTIAL]`
- The convention of Controllers → Services → Repositories pushes toward SRP.
- Nest does not prevent a single service from growing into a god-class. Code review must catch this.

---

### 1.2 Open/Closed (OCP)

**Rule**: Classes are open for extension, closed for modification. Add behaviour by extending, not by editing existing code.

**Smell signals**: `if/else` or `switch` on a `type` field that will grow; adding a new variant requires editing an existing class.

```typescript
// ❌ VIOLATION — every new channel requires editing Notifier
@Injectable()
export class Notifier {
  send(type: 'email' | 'sms' | 'push', message: string) {
    if (type === 'email') { /* ... */ }
    else if (type === 'sms') { /* ... */ }
    // adding 'push' means editing this file
  }
}

// ✅ CORRECT — new channels extend, never modify
export interface NotificationChannel {
  send(message: string): Promise<void>;
}

@Injectable()
export class EmailChannel implements NotificationChannel {
  async send(message: string) { /* smtp */ }
}

@Injectable()
export class SmsChannel implements NotificationChannel {
  async send(message: string) { /* twilio */ }
}

@Injectable()
export class Notifier {
  constructor(
    @Inject('NOTIFICATION_CHANNEL')
    private readonly channel: NotificationChannel,
  ) {}
  async send(msg: string) { return this.channel.send(msg); }
}
```

**NestJS coverage** `[NEST: PARTIAL]`
- Interceptors, Guards, Pipes, Filters are purpose-built extension points — use them.
- Business-logic OCP is developer responsibility. Inject new providers via custom tokens rather than editing existing service logic.

---

### 1.3 Liskov Substitution (LSP)

**Rule**: A subclass must honour its parent's contract completely. Anywhere the parent is used, the child must work without surprises.

**Smell signals**: subclass overrides a method and throws `Error('not supported')` or returns a narrower type; subclass adds preconditions the parent doesn't have.

```typescript
// ❌ VIOLATION — Penguin breaks callers that expect Bird.fly() to work
class Bird {
  fly(): void { /* ... */ }
}
class Penguin extends Bird {
  fly(): void {
    throw new Error("Penguins cannot fly"); // breaks LSP
  }
}

// ✅ CORRECT — contract split before subclassing
abstract class Animal {
  abstract move(): void;
}
abstract class FlyingAnimal extends Animal {
  abstract fly(): void;
  move() { this.fly(); }
}

class Eagle extends FlyingAnimal {
  fly() { /* flap */ }
}
class Penguin extends Animal {
  move() { /* swim */ }
}
```

**NestJS coverage** `[NEST: MANUAL]`
- Pure TypeScript concern. Nest has no runtime check for LSP.
- Use explicit `implements` on all classes. Structural typing alone is insufficient — a class can accidentally satisfy an interface without honouring its semantic contract.

---

### 1.4 Interface Segregation (ISP)

**Rule**: Clients must not be forced to depend on interfaces they don't use. Prefer many narrow interfaces over one fat interface.

**Smell signals**: class implements interface but leaves some methods as `throw new Error('not implemented')` or empty stubs.

```typescript
// ❌ VIOLATION — Robot is forced to implement eat/sleep
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
}
class Robot implements Worker {
  work() { /* ok */ }
  eat() { /* meaningless */ }
  sleep() { /* meaningless */ }
}

// ✅ CORRECT — segregated interfaces
interface Workable  { work(): void; }
interface Feedable  { eat(): void; sleep(): void; }

class Robot implements Workable {
  work() { /* */ }
}
class Human implements Workable, Feedable {
  work() { /* */ }
  eat()  { /* */ }
  sleep(){ /* */ }
}
```

**NestJS coverage** `[NEST: MANUAL]`
- NestJS itself models ISP well (`CanActivate`, `NestInterceptor`, `PipeTransform`, `ExceptionFilter` are all narrow).
- For your own domain interfaces, you must enforce this; Nest will not.

---

### 1.5 Dependency Inversion (DIP)

**Rule**: High-level modules depend on abstractions (interfaces/tokens), not on concrete classes. Concrete implementations are injected, not instantiated inline.

**Smell signals**: `new SomeConcreteClass()` inside a service constructor; importing a concrete ORM model directly into business logic; no injection token, just a concrete class type.

```typescript
// ❌ VIOLATION — OrderService is coupled to MongoUserRepository
@Injectable()
export class OrderService {
  private userRepo = new MongoUserRepository(); // hard-coupled, untestable
  async placeOrder(userId: string) {
    const user = await this.userRepo.findById(userId);
  }
}

// ✅ CORRECT — depend on abstraction; inject concrete at module level
export interface IUserRepository {
  findById(id: string): Promise<User>;
  save(user: User): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');

@Injectable()
export class OrderService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {}
  async placeOrder(userId: string) {
    const user = await this.userRepo.findById(userId);
  }
}

// In module:
@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: MongoUserRepository },
    OrderService,
  ],
})
export class OrderModule {}
```

**NestJS coverage** `[NEST: ENFORCED]`
- IoC container resolves the full dependency graph at startup.
- Use `@Inject(TOKEN)` with a `Symbol` or `InjectionToken` — never rely on class name alone for interfaces (TypeScript erases interface types at runtime).
- Swap implementations per environment by changing the `useClass` / `useFactory` binding in the module, not in the service.

---

## 2. DRY — Don't Repeat Yourself

**Rule**: Every piece of knowledge has exactly one authoritative representation in the codebase. Duplication of logic (not just text) is the violation.

**Smell signals**: same validation regex in two places; same status mapping duplicated across services; copy-pasted error construction; same SQL fragment in multiple queries.

```typescript
// ❌ VIOLATION — tax rate and price calculation duplicated
// order.service.ts
const TAX = 0.18;
const total = price * 1.18;

// invoice.service.ts
const TAX_RATE = 0.18;            // duplicate knowledge
const invoiceTotal = net * 1.18;  // same formula, different variable

// ✅ CORRECT — single source of truth
// constants/tax.ts
export const TAX_RATE = 0.18;

// utils/money.ts
export function applyTax(net: number): number {
  const total = net * (1 + TAX_RATE);
  return Number(total.toFixed(2));
  // Note: for production financial calculations, use a decimal library
  // (decimal.js, big.js) — Number/toFixed has rounding errors at scale.
}

// validators/email.dto.ts
import { IsEmail } from 'class-validator';
export class EmailDto {
  @IsEmail()
  email: string;
}
```

**NestJS coverage** `[NEST: PARTIAL]`
- `ValidationPipe` + class-validator DTOs eliminate duplicated validation logic.
- `APP_PIPE`, `APP_INTERCEPTOR`, `APP_FILTER` registered once via `useGlobal*` or module providers eliminate cross-cutting boilerplate.
- Business-logic duplication (duplicated domain rules across services) is not caught by Nest — use shared utility services or domain modules.

---

## 3. KISS — Keep It Simple

**Rule**: Choose the simplest solution that correctly solves the problem. Complexity must be justified by actual requirements, not anticipated ones.

**Smell signals**: premature abstraction for a single use case; generic factory/registry for two variants; strategy pattern where a plain `if/else` would suffice; over-engineered base classes.

```typescript
// ❌ VIOLATION — 5-layer abstraction for one feature
abstract class BaseHandlerFactory<T> {
  abstract createStrategy(type: string): T;
  protected registry = new Map<string, () => T>();
  register(key: string, factory: () => T) { this.registry.set(key, factory); }
  resolve(key: string): T { return this.registry.get(key)!(); }
}
// ...used in exactly one place, forever

// ✅ CORRECT — simple direct implementation
@Injectable()
export class PaymentService {
  async charge(method: 'card' | 'upi', amount: number) {
    if (method === 'card') return this.stripeCharge(amount);
    return this.upiCharge(amount);
  }
}
// Graduate to Strategy pattern only when a third method is added.
```

**NestJS coverage** `[NEST: MANUAL]`
- Nest's decorator-heavy style can encourage over-engineering. Avoid creating a Guard/Interceptor/Pipe for every trivial concern — plain service methods are fine.

---

## 4. YAGNI — You Aren't Gonna Need It

**Rule**: Do not implement features or abstractions on speculation. Build what is required now; refactor when the need actually materialises.

**Smell signals**: `// TODO: support multi-tenant later` with code already written for it; unused parameters; abstract base classes with only one subclass; config flags that are always `false`.

**NestJS coverage** `[NEST: MANUAL]`
- Nest does not prevent speculative code. Code review must challenge unused parameters, unused providers, and unused module imports.

---

## 5. Law of Demeter — Principle of Least Knowledge

**Rule**: A method should only call methods on: itself, its direct injected dependencies, objects it created, and objects passed as parameters. Never chain calls into internal objects of a dependency (`a.getB().getC().doSomething()`).

**Smell signals**: method chains longer than two levels deep; service reaching into another service's internal object to pull sub-properties.

```typescript
// ❌ VIOLATION — OrderService reaches into User's Address's City
@Injectable()
export class OrderService {
  async getShippingZone(orderId: string) {
    const order = await this.orderRepo.find(orderId);
    const zone = order.user.address.city.zone; // 4-level chain
    return zone;
  }
}

// ✅ CORRECT — delegate: UserService exposes what OrderService needs
@Injectable()
export class UserService {
  async getShippingZone(userId: string): Promise<string> {
    const user = await this.userRepo.findWithAddress(userId);
    return user.address.city.zone; // internal to UserService
  }
}

@Injectable()
export class OrderService {
  constructor(private readonly userService: UserService) {}
  async getShippingZone(orderId: string) {
    const order = await this.orderRepo.find(orderId);
    return this.userService.getShippingZone(order.userId); // one level
  }
}
```

**NestJS coverage** `[NEST: MANUAL]`
- Nest's DI encourages injecting services, which makes delegation natural. But it does not prevent deep chaining. Code review must flag it.

---

## 6. Composition over Inheritance

**Rule**: Prefer assembling behaviour from injected collaborators over inheriting it from base classes. Inheritance models "is-a"; composition models "has-a / uses-a".

**Smell signals**: inheritance chains deeper than 2 levels; base class with `abstract` methods overridden in every subclass differently; `super()` calls that must be made in a specific order.

**NestJS coverage** `[NEST: ENFORCED]`
- DI container makes composition the path of least resistance.
- Avoid `extends` for anything other than framework-provided base classes (e.g. `ExceptionFilter`, built-in pipes).

---

## 7. Separation of Concerns (SoC)

**Rule**: Each layer/file handles exactly one cross-cutting concern. Business logic must not leak into HTTP/transport concerns and vice versa.

**Layer contract** — enforce strictly:

| Layer | Owns | Must NOT contain |
|---|---|---|
| **Controller** | Parse HTTP input, call service, return DTO | Business logic, DB queries |
| **Service** | Domain/business logic | `@Req()`, `Response`, HTTP status codes |
| **Repository** | DB access only | Business rules, HTTP concepts |
| **Guard** | Auth/authz decision (boolean) | Business logic, response shaping |
| **Pipe** | Transform + validate input | Business logic, DB calls |
| **Interceptor** | Cross-cutting: logging, caching, response shape | Business logic |
| **Filter** | Map exceptions → HTTP responses | Business logic |

```typescript
// ❌ VIOLATION — business logic and HTTP concerns mixed in controller
@Post('checkout')
async checkout(@Body() dto: CheckoutDto, @Res() res: Response) {
  const inventory = await this.db.findInventory(dto.items); // DB in controller
  if (inventory.some(i => i.stock === 0)) {
    return res.status(422).json({ error: 'Out of stock' }); // HTTP in controller
  }
  const order = await this.db.createOrder(dto); // DB in controller
  return res.status(201).json(order);
}

// ✅ CORRECT — each layer owns its concern
// order.controller.ts
@Post('checkout')
@HttpCode(HttpStatus.CREATED)
async checkout(@Body() dto: CheckoutDto): Promise<OrderResponseDto> {
  return this.orderService.checkout(dto); // delegates entirely
}

// order.service.ts
async checkout(dto: CheckoutDto): Promise<OrderResponseDto> {
  await this.inventoryService.assertAvailable(dto.items); // throws DomainException
  const order = await this.orderRepo.create(dto);
  return plainToInstance(OrderResponseDto, order);
}
```

**NestJS coverage** `[NEST: PARTIAL]`
- File structure and decorators nudge toward SoC but do not enforce it.
- Injecting `@Res()` into a controller bypasses Nest's response pipeline — avoid it.

---

## 8. Fail Fast

**Rule**: Validate inputs and invariants as early as possible. Do not let invalid state propagate deep into the system before erroring.

**NestJS coverage** `[NEST: PARTIAL]`
- `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` enforces fail-fast at the HTTP boundary — always enable globally.
- Domain invariants inside services must still be checked explicitly.

---

## 9. Command-Query Separation (CQS)

**Rule**: A method either returns data (Query) or changes state (Command) — never both. Mixing read and write in one method creates hidden side effects.

**NestJS coverage** `[NEST: MANUAL]`
- `@nestjs/cqrs` provides a formal CQS bus. Use it for complex domains.
- For simple CRUD, naming discipline is sufficient. Flag any method starting with `get`/`find`/`list` that also writes state.

---

## 10. Encapsulation

**Rule**: Expose the minimum necessary surface. Internal state, helper methods, and implementation details are private. External consumers interact only through the defined public API.

**NestJS coverage** `[NEST: MANUAL]`
- TypeScript `private`/`protected` is erased at runtime. Nest cannot enforce encapsulation.
- The `@Module({ exports: [] })` array is the module-level encapsulation mechanism — only export what downstream modules genuinely need.

---

## 11. Error Handling Contract

**Rule**: Errors must carry structured, consistent information. Never let raw database errors or stack traces reach the client. Domain errors must be distinct from infrastructure errors.

### Exception hierarchy (recommended)

```typescript
export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(resource: string, id: string) {
    super(`${resource} with id "${id}" not found`, 'RESOURCE_NOT_FOUND', 404);
  }
}

export class BusinessRuleViolationException extends DomainException {
  constructor(message: string, code = 'BUSINESS_RULE_VIOLATION') {
    super(message, code, 422);
  }
}

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    ctx.getResponse<Response>().status(exception.statusCode).json({
      statusCode: exception.statusCode,
      error: exception.code,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
```

### Error envelope — the wire contract

```json
{
  "statusCode": 404,
  "error": "RESOURCE_NOT_FOUND",
  "message": "User with id \"abc\" not found",
  "timestamp": "2026-05-03T10:00:00.000Z",
  "path": "/v1/users/abc"
}
```

`error` is the **machine-readable code** in `UPPER_SNAKE_CASE`. `message` is the **human-readable explanation**. Clients code against `error`; humans read `message`. Never collapse the two.

### 422 validation extension

```json
{
  "statusCode": 422,
  "error": "VALIDATION_FAILED",
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "must be a valid email" },
    { "field": "age", "message": "must be a positive integer" }
  ],
  "timestamp": "2026-05-03T10:00:00.000Z",
  "path": "/v1/users"
}
```

### Suppressing auto-logging for expected errors (v11)

NestJS v11 introduces `IntrinsicException`. Throw subclasses of it for expected, non-bug errors (e.g. routine 404s, 401s) that you do not want polluting the error logs.

**NestJS coverage** `[NEST: PARTIAL]`
- Built-in `HttpException` and subclasses handle common HTTP errors.
- `@Catch()` filters handle custom exception types — register globally via `APP_FILTER`.
- You must define the domain exception hierarchy; Nest does not provide it.

---

## 12. Transactional Integrity

**Rule**: Operations that must succeed-or-fail-together must execute inside a single transaction. The unit of transaction is the unit of business operation, not the unit of HTTP request. External side effects (payments, emails, push notifications, queue publishes to non-transactional brokers) must NOT execute inside a transaction — they cannot be rolled back.

**Smell signals**: two or more `await repo.save(...)` calls in sequence with no transaction wrapper; a read used to compute a write, both outside a transaction; an HTTP call to a third-party service inside a transaction block; nested service calls each opening their own transaction; `// TODO: make atomic` comments.

```typescript
// ❌ VIOLATION — two writes that must be atomic, executed independently
@Injectable()
export class TransferService {
  async transfer(fromId: string, toId: string, amount: number) {
    await this.accountRepo.decrement({ id: fromId }, 'balance', amount);
    // process crash here = money lost
    await this.accountRepo.increment({ id: toId }, 'balance', amount);
    await this.ledgerRepo.save({ fromId, toId, amount });
  }
}

// ✅ CORRECT — single transaction; all-or-nothing
@Injectable()
export class TransferService {
  constructor(private readonly dataSource: DataSource) {}

  async transfer(fromId: string, toId: string, amount: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.decrement(Account, { id: fromId }, 'balance', amount);
      await manager.increment(Account, { id: toId }, 'balance', amount);
      await manager.save(Ledger, { fromId, toId, amount });
    });
  }
}

// ✅ CORRECT — transactional outbox: commit DB state first, dispatch external work after
async placeOrder(dto: PlaceOrderDto) {
  const order = await this.dataSource.transaction(async (m) => {
    const o = await m.save(Order, dto);
    await m.save(Outbox, { type: 'CHARGE_PAYMENT', payload: { orderId: o.id } });
    return o;
  });
  return order;
}
```

**Per-ORM equivalents** — pick one strategy per project; do not mix.

| ORM | Mechanism |
|---|---|
| TypeORM | `dataSource.transaction(cb)` or `@Transactional()` from `typeorm-transactional` |
| Prisma | `prisma.$transaction([...])` (sequential) or `prisma.$transaction(async (tx) => {})` (interactive) |
| Mongoose | `session.withTransaction(async () => {})` — requires replica set; standalone Mongo silently no-ops |

**Critical pitfalls**:
- **Nested transactions**: if service A calls service B and both wrap in their own transactions, you have two independent transactions. Pass the transaction handle/manager down explicitly, or use AsyncLocalStorage propagation (`typeorm-transactional`, `nestjs-cls`).
- **Long-held transactions** cause lock contention and connection-pool exhaustion. No HTTP calls inside. No queue publishes inside (unless the broker supports transactional outbox semantics natively).
- **Retry semantics**: a transaction that fails on a serialization error must be retried by the caller, not by inner code.

**NestJS coverage** `[NEST: MANUAL]`
- Nest provides DI and the request lifecycle but has no opinion on transactions.

---

## 13. Resilience: Timeouts, Retries, Circuit Breakers

**Rule**: Every outbound call to an external system has an explicit timeout. Retries are bounded, use exponential backoff, and only apply to idempotent operations or operations protected by an idempotency key. Failures from external systems are mapped to domain exceptions, not leaked.

**Smell signals**: `axios.get(...)` with no `timeout`; `fetch(...)` without `AbortSignal.timeout`; Mongoose query without `.maxTimeMS()`; default Redis/Mongo client used everywhere with no client-level timeout config; infinite or unbounded retries; retry on a non-idempotent `POST` without an idempotency key.

```typescript
// ✅ CORRECT — explicit timeout, bounded retry, error mapping
@Injectable()
export class FxService {
  constructor(private readonly http: HttpService) {}

  async getRate(currency: string): Promise<number> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ rate: number }>(`https://fx.example.com/rate/${currency}`, {
          timeout: 3000,
        }).pipe(
          retry({
            count: 2,
            delay: (_err, attempt) => timer(2 ** attempt * 100),
          }),
        ),
      );
      return res.data.rate;
    } catch (err) {
      throw new ExternalServiceUnavailableException('fx-service', err);
    }
  }
}
```

**What to set timeouts on**:

| Client | Timeout setting |
|---|---|
| `@nestjs/axios` `HttpService` | `timeout` per request OR `HttpModule.register({ timeout })` |
| Native `fetch` | `signal: AbortSignal.timeout(ms)` |
| Mongoose query | `.maxTimeMS(ms)` per query OR `serverSelectionTimeoutMS` at connection |
| Redis (`ioredis`) | `connectTimeout`, `commandTimeout` at client construction |
| BullMQ producer | job-level `timeout` option; consumers use `lockDuration` |
| gRPC client | `deadline` per call |
| Postgres (`pg`) | `statement_timeout` at connection or per-session |

**Retry rules**:
- **Idempotent reads**: safe to retry on transient failures.
- **Non-idempotent writes**: only retry if the downstream supports an idempotency key and you are sending one.
- **Never retry** on: `400`, `401`, `403`, `404`, `422`, validation failures.
- **Exponential backoff with jitter** for distributed callers.

**Circuit breakers** — use `cockatiel` or `opossum` when calling brittle dependencies.

**NestJS coverage** `[NEST: PARTIAL]`
- `HttpModule` (`@nestjs/axios`) supports `timeout` at module-level. Configure it; do not rely on per-call discipline.
- For non-HTTP clients, set timeouts at client construction.
- Circuit breakers are not built-in.
- Map all infrastructure exceptions to domain exceptions in a single layer.

---

## 14. Test Discipline

**Rule**: Every public method on a service has at least one unit test covering the happy path and one covering each failure branch. Every controller route has at least one e2e test asserting the wire contract (status code, response shape). Tests run in isolation — no test depends on another test's state, file order, or shared mutable fixtures.

**Smell signals**: services with public methods and no `.spec.ts` file; tests that pass individually but fail when the suite runs in a different order; tests that share a database row across cases; mocks of the system under test; tests that assert internal implementation details (private method calls, exact SQL strings) instead of observable behaviour; coverage reports gated on line coverage only, with no branch threshold.

```typescript
// ❌ VIOLATION — mocks the SUT itself; tests nothing
describe('UserService', () => {
  it('creates a user', async () => {
    const service = { createUser: jest.fn().mockResolvedValue({ id: '1' }) };
    expect(await service.createUser({})).toEqual({ id: '1' });
  });
});

// ✅ CORRECT — real SUT, mocked dependencies, observable behaviour asserted
describe('UserService', () => {
  let service: UserService;
  let repo: jest.Mocked<IUserRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: USER_REPOSITORY,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UserService);
    repo = module.get(USER_REPOSITORY);
  });

  describe('createUser', () => {
    it('creates a user when the email is not taken', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockResolvedValue({ id: '1', email: 'a@b.com' } as User);

      const result = await service.createUser({ email: 'a@b.com' });

      expect(result.id).toBe('1');
      expect(repo.create).toHaveBeenCalledWith({ email: 'a@b.com' });
    });

    it('throws BusinessRuleViolation when the email is taken', async () => {
      repo.findByEmail.mockResolvedValue({ id: 'existing' } as User);

      await expect(service.createUser({ email: 'a@b.com' }))
        .rejects.toThrow(BusinessRuleViolationException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
```

**Test pyramid**:

| Layer | What | Speed | Mocks | When to write |
|---|---|---|---|---|
| **Unit** | Single service method | <10ms | All injected deps mocked | Always |
| **Integration** | Service + real DB / real Redis | 100ms–1s | Only true externals (gateways) | When DB behaviour matters |
| **E2E** | HTTP request through full app | 1s+ | Only true externals | One per route, asserting status + envelope |

**E2E pattern**:

```typescript
describe('POST /users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaymentGateway)
      .useValue({ charge: jest.fn() })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 201 with the created user envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'a@b.com', name: 'Test' })
      .expect(201);

    expect(res.body).toEqual({
      data: expect.objectContaining({ id: expect.any(String), email: 'a@b.com' }),
    });
  });
});
```

**Database strategy** — pick one per project:

| Strategy | Trade-off |
|---|---|
| Per-test transaction rollback | Fast; doesn't test commit-time behaviour |
| Truncate tables between tests | Slow; tests real commit |
| Testcontainers (real DB in Docker per suite) | Slowest; highest fidelity; ideal for CI |
| In-memory (`pg-mem`, `mongodb-memory-server`) | Fast; subtle behaviour differences |

**Naming** — test names describe behaviour, not method names. `it('returns 422 when email is invalid')` not `it('createUser')`.

**Fixtures vs factories** — prefer factories.

**Coverage targets** — branch coverage > 80%, not line coverage.

**NestJS coverage** `[NEST: PARTIAL]`
- CLI generates `.spec.ts` stubs alongside every artifact.
- `Test.createTestingModule()` provides an isolated DI container per test — use `.overrideProvider()` to swap real deps for mocks.

---

## 15. NestJS v11 — Coverage Map

### What NestJS enforces or strongly guides

| Concern | Mechanism |
|---|---|
| Dependency Inversion | `@Injectable()`, `@Inject()`, IoC container |
| Module encapsulation | `@Module({ exports })` |
| Request pipeline SoC | Middleware → Guard → Interceptor → Pipe → Controller → Filter |
| Input validation | `ValidationPipe` + class-validator + class-transformer |
| HTTP routing & verbs | `@Get/Post/Put/Patch/Delete` + `@Controller` prefix |
| API versioning | `enableVersioning()` + `@Version()` |
| Exception shaping | `@Catch()` filters + `APP_FILTER` |
| Cross-cutting logic | Interceptors (`APP_INTERCEPTOR`), Pipes (`APP_PIPE`) |
| Logging (v11) | `ConsoleLogger` with JSON mode |
| Sensitive error suppression (v11) | `IntrinsicException` |
| CQRS (v11) | `@nestjs/cqrs` — request-scoped + strongly-typed |

### What NestJS does NOT solve — developer responsibility

| Concern | What to do |
|---|---|
| SRP inside services | Enforce via code review; keep files < ~150 lines |
| LSP & ISP | Write explicit `implements` on all classes |
| Response DTO projection | Always return `plainToInstance(ResponseDto, entity)` |
| Pagination contract | Standardise on one library or shared `PaginatedResponseDto<T>` |
| Rate limiting | `@nestjs/throttler` — configure globally |
| RBAC / permissions | Build a `PermissionsGuard` backed by CASL or role-matrix service |
| Domain exception hierarchy | Define `DomainException` base + subtypes |
| Repository pattern | Pick one ORM; define `IRepository<T>` interface; inject via token |
| Encapsulation | Mark all internals `private`; audit `@Module.exports` in review |
| Law of Demeter | Flag any method chain > 2 levels in code review |
| **Transaction boundaries** | Choose ONE strategy. External side effects go through an outbox |
| **Timeouts** | Set at client construction. Never rely on per-call discipline |
| **Retries & circuit breakers** | `cockatiel` or `opossum`; bounded retries with backoff + jitter |
| **Test discipline** | Branch coverage > 80%; factories over fixtures |

---

## 16. Reviewer Checklist

Run through this list for every PR.

### Structure
- [ ] Does each class have a single, nameable responsibility?
- [ ] Is the file under ~150 lines (services), ~100 lines (controllers)?
- [ ] Are all `private` helpers actually marked `private`?
- [ ] Does the module's `exports` array expose only what's necessary?

### DI & Coupling
- [ ] No `new ConcreteClass()` inside a service or controller?
- [ ] Are interface-based injections using `Symbol` tokens, not class references?
- [ ] Can the injected dependency be swapped in tests with a mock?

### Request Pipeline
- [ ] No business logic in controllers (only: parse input → call service → return DTO)?
- [ ] No `@Res()` injection unless explicitly needed (e.g. streaming)?
- [ ] Are Guards used for auth, not for data fetch?
- [ ] Is `ValidationPipe` active globally?

### API Contract
- [ ] Is the response DTO mapping explicit (`plainToInstance`)? Raw entity is never returned?
- [ ] Does every error response conform to the standard envelope?
- [ ] Are new routes versioned or covered by an existing version contract?
- [ ] Does pagination return `{ data, meta: { page, limit, total } }`?

### Code Quality
- [ ] No method chains deeper than 2 levels?
- [ ] No method that both queries and mutates state?
- [ ] No speculative parameters that no caller currently passes?
- [ ] No duplicated validation, constants, or business rules?
- [ ] Do all subclasses fully honour parent contracts (LSP)?
- [ ] No implemented interface methods that throw or are stubs (ISP)?

### Transactions
- [ ] Are all writes that must be atomic wrapped in a single transaction?
- [ ] No external HTTP calls or queue publishes inside transaction blocks?
- [ ] If the operation has external side effects, is an outbox/event-dispatch pattern used?
- [ ] Is the transaction strategy consistent with the rest of the codebase?

### Resilience
- [ ] Does every outbound HTTP / DB / queue call have an explicit timeout?
- [ ] Are retries bounded (no infinite loops) and using exponential backoff?
- [ ] Are non-idempotent writes either not retried or protected by an idempotency key?
- [ ] Are infrastructure exceptions mapped to domain exceptions before reaching the controller?

### Tests
- [ ] Does every public service method have at least one unit test (happy path + each failure branch)?
- [ ] Does every new controller route have at least one e2e test asserting status code and response envelope?
- [ ] Do tests mock injected dependencies, not the system under test?
- [ ] Are tests independent of execution order and shared mutable state?
- [ ] Do test names describe observable behaviour, not method names?
