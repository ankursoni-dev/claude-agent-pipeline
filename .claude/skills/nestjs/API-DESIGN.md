# API Design — NestJS Endpoint Contracts

> Use this file when designing a new endpoint contract: HTTP method, route shape, parameter placement, status code, response envelope, pagination.
> Conventions in this file align with the universal envelope in `SKILL.md`. Do not invent variants.

---

## 1. Quick decision table

| Situation | Use |
|---|---|
| Fetch resource | `GET` |
| Create resource | `POST` |
| Replace entire resource | `PUT` |
| Update partial resource | `PATCH` |
| Delete resource | `DELETE` |
| Required identifier in URL | Route param |
| Optional filter / pagination / sort | Query param |
| Structured payload | Body |
| Auth / metadata / correlation IDs | Headers |
| Invalid syntax / malformed body | `400` |
| Validation failure (well-formed but rejected) | `422` |
| Missing or invalid auth | `401` |
| Authenticated but forbidden | `403` |
| Resource missing | `404` |
| Duplicate / state conflict | `409` |
| Resource gone permanently | `410` |
| Rate limited | `429` |
| Server bug | `500` |
| Upstream service down | `502` / `503` / `504` |

---

## 2. HTTP methods

| Method | Use | Idempotent | Body |
|---|---|---|---|
| `GET` | Read | Yes | No |
| `POST` | Create / trigger action | No | Yes |
| `PUT` | Replace entire resource | Yes | Yes |
| `PATCH` | Partial update | Yes (in practice) | Yes |
| `DELETE` | Delete | Yes | Optional |

Idempotency rule: a `PUT`/`DELETE` repeated with the same input must produce the same final state. If your "update" creates a new row each time, it is `POST`, not `PUT`.

---

## 3. Route design

### Resource-based, plural, kebab-case

```
GET    /users
GET    /users/:id
POST   /users
PATCH  /users/:id
DELETE /users/:id
GET    /user-profiles
```

### Nested — at most two levels

```
GET /users/:userId/orders
GET /users/:userId/orders/:id
GET /users/:userId/orders/:id/items/:itemId  # 3 levels — flatten
```

When nesting deepens, prefer flat routes with query filters: `GET /orders?userId=123&itemId=456`.

### Actions — avoid; use sub-resources

```
❌ POST /users/:id/activate
✅ POST /users/:id/activations
✅ PATCH /users/:id { "status": "active" }
```

Pure RPC verbs (`/getUsers`, `/createOrder`) are anti-patterns — never use.

### Versioning

Always version. URI versioning is the simplest and most explicit:

```
/v1/users
```

NestJS:
```typescript
app.enableVersioning({ type: VersioningType.URI });

@Controller({ path: 'users', version: '1' })
export class UsersController {}
```

---

## 4. Parameter placement

### Route params — required identifiers

```typescript
@Get(':id')
findOne(@Param('id') id: string) {}
```

### Query params — optional modifiers

```typescript
@Get()
findAll(@Query() query: ListUsersDto) {}
```

```
GET /users?page=1&limit=20&sort=-createdAt&search=ankur&fields=id,name
```

Conventions:
- `page` (1-indexed) + `limit` for pagination
- `sort=-field` for descending; comma-separated for multiple
- `fields=a,b,c` for sparse projections
- `include=relation1,relation2` for relation expansion

### Body — structured payloads

```typescript
@Post()
create(@Body() dto: CreateUserDto) {}
```

### Headers — auth, metadata, correlation

```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
X-Request-Id: <uuid>
Idempotency-Key: <uuid>
```

Never put auth tokens, IDs, or anything sensitive in query params — they leak into access logs.

---

## 5. Status codes — the working set

### 2xx Success

| Code | When |
|---|---|
| `200` | Standard success with body |
| `201` | Resource created. Return the created entity in the body and `Location` header |
| `202` | Accepted for async processing. Return a job/task ID |
| `204` | Success with no body (typical for `DELETE`, sometimes `PUT`) |

### 3xx Redirection

| Code | When |
|---|---|
| `301` | Resource moved permanently |
| `304` | Cached version still valid (paired with `ETag` / `If-None-Match`) |

### 4xx Client errors

| Code | When |
|---|---|
| `400` | Malformed syntax — JSON parse error, wrong content-type, missing required body |
| `401` | Missing or invalid auth token |
| `403` | Authenticated, but not allowed to perform this action |
| `404` | Resource does not exist |
| `409` | State conflict — duplicate key, optimistic lock failure |
| `410` | Resource permanently gone |
| `412` | Precondition failed — `If-Match` ETag mismatch |
| `413` | Payload too large |
| `415` | Wrong content-type |
| `422` | Well-formed body, validation/business-rule failure |
| `429` | Rate limited. Include `Retry-After` header |

**`400` vs `422`** — frequently confused:
- `400` = "I cannot parse this" (bad JSON, wrong content-type)
- `422` = "I parsed it fine but it's invalid" (failed `class-validator` rules, broke a business rule)

NestJS `ValidationPipe` defaults to `400`. Override with `errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY` if your project uses `422`. Pick one; never both.

### 5xx Server errors

| Code | When |
|---|---|
| `500` | Unexpected server failure (your bug) |
| `502` | Upstream returned invalid response |
| `503` | Server temporarily unavailable |
| `504` | Upstream timed out |

---

## 6. Response envelope — the single contract

### Success — single resource

```json
{
  "data": {
    "id": "abc",
    "email": "user@example.com"
  }
}
```

### Success — paginated list

```json
{
  "data": [ { "id": "abc" }, { "id": "def" } ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120
  }
}
```

### Error — standard

```json
{
  "statusCode": 404,
  "error": "RESOURCE_NOT_FOUND",
  "message": "User with id \"abc\" not found",
  "timestamp": "2026-05-03T10:00:00.000Z",
  "path": "/v1/users/abc"
}
```

### Error — 422 validation extension

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

`error` is the **machine-readable code** (UPPER_SNAKE_CASE). `message` is the human-readable explanation. The two serve different consumers — never collapse them.

---

## 7. Pagination

### Offset (simpler, default)

Request: `GET /users?page=1&limit=20`

### Cursor (correct for large or live data)

Request: `GET /events?cursor=<opaque>&limit=20`

Response:
```json
{
  "data": [ ... ],
  "meta": {
    "limit": 20,
    "nextCursor": "eyJpZCI6IjEyMyJ9",
    "hasMore": true
  }
}
```

`limit` always has a server-enforced maximum (typically 100). Reject requests above it — do not silently cap.

---

## 8. Filtering, sorting, sparse fields

```
GET /products?category=tech&minPrice=100&maxPrice=500
GET /users?sort=-createdAt,name
GET /users?fields=id,name,email
GET /posts/123?include=author,comments
```

Validate every query parameter via a `class-validator` DTO. Unknown query params should be rejected (`forbidNonWhitelisted: true`).

---

## 9. File uploads

```typescript
@Post(':id/avatar')
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024 },
}))
upload(
  @Param('id') id: string,
  @UploadedFile(new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
      new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
    ],
  })) file: Express.Multer.File,
) {}
```

Status codes:
- `413` — file too large
- `415` — wrong MIME type
- `422` — file present but failed business validation

Never write uploaded files to local disk in production. Stream to object storage (S3 / GCS / equivalent) and persist only the URL.

---

## 10. Idempotency

For `POST` endpoints that create resources, accept an `Idempotency-Key` header. Cache the response by key for ~24h. A retry with the same key returns the cached response without re-executing.

```typescript
@Post()
async create(
  @Headers('idempotency-key') key: string | undefined,
  @Body() dto: CreateOrderDto,
) {
  return this.orderService.createIdempotent(key, dto);
}
```

Required for: payment APIs, order creation, anything that triggers external charges or sends communications.

---

## 11. Caching

Set explicit cache headers on `GET` endpoints:

```
Cache-Control: private, max-age=300
ETag: "v1-abc123"
```

For conditional requests, support `If-None-Match` → `304 Not Modified`.

---

## 12. Anti-patterns — never ship these

- Verb-heavy routes (`/getUsers`, `/deleteOrder`)
- `200 OK` for everything (`{ success: false }` body with `200` is a lie)
- Returning raw ORM entities — always project to a response DTO
- Sensitive data in query params
- Auth state encoded in route paths (`/admin/users` instead of `/users` + RBAC guard)
- Inconsistent envelope between endpoints
- Generic `success: true` / `success: false` responses
- Returning stack traces or framework internals to the client

---

## 13. Endpoint review — preflight checklist

Before merging a new endpoint:

- [ ] Correct HTTP method for the operation's semantics
- [ ] Route is plural, kebab-case, versioned, ≤2 levels deep
- [ ] Required IDs in route params; optional modifiers in query; payload in body; auth in headers
- [ ] Request DTO with `class-validator` decorators
- [ ] Response DTO separate from entity; projected via `plainToInstance`
- [ ] Correct status code on success (`200` / `201` / `202` / `204`)
- [ ] Error paths return the standard envelope with appropriate codes
- [ ] Pagination implemented if the response can grow unbounded
- [ ] Auth guard applied (or explicitly marked `@Public()`)
- [ ] Rate limit applied if endpoint is public or expensive
- [ ] Swagger annotations present (`@ApiOperation`, `@ApiResponse`)
- [ ] Idempotency considered for non-idempotent writes that may be retried
