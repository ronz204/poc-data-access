# HTTP Endpoints — Spec

> The HTTP interface to every use case of the other slices: it only translates, so the contracts those slices guarantee hold unchanged over the wire.

## Intent

The use cases already guarantee what they promise: atomicity, tenant isolation, idempotency, bounded reads. A client reaching them over HTTP must get exactly those guarantees, and the interface must be able to change without touching business rules. So this layer does nothing but translate: identify the simulated context, validate the input, run one use case, and map the result and the errors to HTTP.

## Scope

Owns:

- An Elysia application exposing every use case of the other specs under `/v1`.
- Handling of the simulated context, request validation, response and error mapping, the pagination envelope, the idempotency header and request ids.
- The health endpoints and the generated OpenAPI document.
- Its own process entry point and graceful shutdown.

Permissions, invariants, errors and audited actions stay in the slices that own them; this spec owns only the HTTP mapping of them.

Non-goals:

- Real authentication: credential or token verification, sessions, passwords, a second factor.
- CORS and anything for browsers or frontends.
- Rate limiting or throttling.
- Outbound webhooks, WebSockets, server-sent events, GraphQL, file uploads, API keys.
- Caching headers (`ETag`, `If-Match`).
- More than one API version at a time.
- Any UI.

## Contract

### Context

The `X-Tenant-Id` and `X-Actor-Id` headers carry a claimed identity that is never verified. What is verified, on every tenant request, is membership and role, through the admission use case of tenant-onboarding.

| Kind of route | Headers required | Context built |
|---|---|---|
| Tenant | `X-Tenant-Id` and `X-Actor-Id` | `tenant(tenantId, actorId)` |
| Platform (create tenant) | `X-Actor-Id` | `platform(actorId)` |
| Public (sign-up, accept invitation) | none | `system`; accept invitation is scoped to the tenant of the invitation, found by its token |

- A missing or malformed header on a route that needs it fails with 400 `context_invalid`.
- A tenant header naming a tenant the actor does not belong to fails with 403 `not_a_member` and returns no data.
- Public routes ignore any tenant or actor header as a source of authority.
- The origin of every context is the default `request`.
- Every route calls the Transactor once.

### Routes

All under `/v1`, grouped by resource. Ids are UUID strings and timestamps are ISO-8601 in UTC.

| Resource | Routes |
|---|---|
| Public | `POST /users` (sign up), `POST /invitations/accept` (token, name) |
| Platform | `POST /tenants` (create tenant) |
| Members | `PATCH /members/{userId}` (change role), `DELETE /members/{userId}` (remove), `DELETE /members/me` (leave) |
| Invitations | `POST /invitations`, `GET /invitations`, `DELETE /invitations/{id}` (revoke) |
| Products | `POST /products`, `GET /products`, `GET /products/{id}`, `PATCH /products/{id}`, `DELETE /products/{id}`, `POST /products/{id}/restore` |
| Stock | `POST /products/{id}/stock-adjustments`; after the stock refactor also `GET /products/{id}/stock`, with the adjustment served by inventory at the same route |
| Categories | `POST /categories`, `GET /categories`, `PATCH /categories/{id}`, `DELETE /categories/{id}` |
| Customers | `POST /customers`, `GET /customers`, `GET /customers/{id}`, `PATCH /customers/{id}`, `DELETE /customers/{id}`, `POST /customers/{id}/restore` |
| Orders | `POST /orders` (checkout), `GET /orders/{id}`, `GET /orders` |
| Wallet | `GET /wallet`, `GET /wallet/entries`, `POST /wallet/withdrawals`, `POST /wallet/adjustments`, `POST /wallet/entries/{id}/reversals` |
| Audit | `GET /audit-trail` |
| Reports | `GET /reports/sales-by-product-month`, `GET /reports/top-customers`, `GET /reports/low-stock`, `POST /reports/sales-by-product-month/refresh` |

Operational routes sit outside `/v1` and need no context: `GET /health/live`, `GET /health/ready`, and the OpenAPI document at `GET /v1/openapi.json`. (Assumed path.)

`PATCH /products/{id}` carries the expected version in the body as `expectedVersion`. (Assumed default.) Status codes are, by default: 201 with a `Location` header on create, 200 on read, update and action, 204 on delete and soft delete. A throttled report refresh returns 200 with the current `as_of`.

### Idempotency header

`Idempotency-Key` is required on checkout and on the wallet's withdrawals, adjustments and reversals.

- Absent: 400 `idempotency_key_required`. Invalid format: 422 `validation_failed`.
- A replay returns the original status and body unchanged, with the header `Idempotent-Replayed: true`. (Assumed default.)
- Everything else about idempotency stays in the idempotency-keys slice.

### Errors

Every error is `application/problem+json` with `type`, `title`, `status`, `detail`, a stable `code` (the code of the domain error or the mapping of the persistence error) and the request id. It carries the structured extensions that the owning spec defines, such as the lines lacking stock, the available balance and the validation issues per field. The mapping is fixed. (Assumed defaults.)

| Situation | Status and code |
|---|---|
| Input validation | 422 `validation_failed` |
| Invalid context headers | 400 `context_invalid` |
| Not a member of the tenant | 403 `not_a_member` |
| Role too low | 403 `forbidden` |
| Not found | 404 `not_found` |
| Duplicate, stale version, restore, last-owner or invitation conflicts | 409 with the domain code |
| Insufficient stock | 409 `insufficient_stock` |
| Insufficient funds | 409 `insufficient_funds` |
| Idempotency key reused with a different request | 422 `idempotency_conflict` |
| Idempotent request still running after the bounded wait | 409 `request_in_progress`, with `Retry-After` |
| Optimistic contention beyond its retry bound | 409 `contention`, with `Retry-After` |
| Persistence timeout or unavailable (database or Redis) | 503, with `Retry-After` |
| Anything unexpected | 500 `internal_error`, with only the request id; the details go to the logs |

Responses never expose stack traces, SQL, or constraint or table names.

### Contract document

The OpenAPI document is generated from the routes' schemas. The input schemas are the same zod schemas the boundary validates with. Every route appears with its request, its responses and its error codes. The document is regenerated, never edited by hand, and it is the only description of the HTTP contract. Elysia validates directly with the zod 4 schemas, and the document converts them with zod's own JSON Schema export.

### Lists

List routes take `limit` (default 20, maximum 100) and an opaque `cursor`, and return `{ items, nextCursor }`, with `nextCursor` null at the end. A tampered or invalid cursor fails with 422 `invalid_cursor`. Clients never build a cursor. (Assumed defaults.)

### Data formats and limits

(Assumed defaults.)

- Money is an integer number of minor units restricted to JavaScript safe integers; larger values are rejected with 422.
- JSON bodies only, with a body limit of 1 MiB.
- A request timeout of 30 seconds, with a database statement timeout below it.

### Request ids and logging

(Assumed defaults.)

- `X-Request-Id` is accepted when well formed and generated otherwise, then echoed in every response and problem body and logged. It is not stored in the audit trail, which records the origin only.
- Logs are structured: request id, route, status, duration, tenant and actor.
- The invitation token and idempotency keys are never logged, and the bodies of sign-up and accept-invitation are redacted.
- No CORS headers are sent.

### Process

A separate entry point, apart from the outbox worker and the queue consumer. Configuration comes from validated environment settings. On shutdown it stops accepting connections, finishes the requests in flight and closes the pools.

### Current state

The Elysia application exists as its own process entry point. It assigns or echoes `X-Request-Id`, logs one structured line per request, maps validation, unknown routes, shared-kernel domain errors and persistence errors to problem+json, and lets each bounded context's plugin map its own domain errors. It serves `GET /health/live`, `GET /health/ready` (PostgreSQL only; the Redis check arrives with the outbox) and the OpenAPI document at `GET /v1/openapi.json`. It enforces the body limit and idle timeout, and on shutdown it stops the server and then closes the pool. The only business route so far is `POST /v1/users` (sign up). Not built yet: the tenant and platform context headers, admission, the idempotency header, the pagination envelope and the HTTP tests. Routes are added slice by slice as each use case lands. When the stock refactor reaches its contract step, the stock routes are served by inventory.

## Invariants

- The HTTP layer holds no business rule and no SQL: it validates, builds the context, calls one use case through the Transactor once, and maps results and errors.
- Every input is validated with zod before it reaches a use case.
- A tenant route never runs without a verified membership for the claimed tenant and actor.
- The tenant of a request comes only from its header or, for accept invitation, from the invitation behind the token; never from a body.
- A use case behaves identically through HTTP and through scripts.
- Every error response is problem+json with a stable code and never leaks internals.
- An idempotent replay returns the original status and body.
- Endpoints that move money require an idempotency key.
- Every list endpoint is bounded.
- Every route is in the generated OpenAPI document.
- Secrets never appear in logs or responses, except where a use case returns them once, as the invitation token on invite.

## Deferred / Open questions

- Real authentication. When it enters scope, the headers are replaced by a verified identity without changing the use cases.
- Rate limiting.
- `ETag` and `If-Match` instead of `expectedVersion`.
- An asynchronous job style for the report refresh.
- Outbound webhooks.
- CORS, if a frontend appears.
- A catalog page of error codes.
- A deprecation policy beyond `/v1`.
- Whether `Idempotent-Replayed` is worth keeping.

## Acceptance criteria

Tests over the application handler against a real PostgreSQL and Redis, using vitest once it is introduced:

- Public routes work without headers; tenant routes with missing or malformed headers get 400; a non-member gets 403 and no data; a member below the required role gets 403.
- Each route returns its documented status and body.
- Invalid input returns 422 with the issues per field and no side effect.
- The error table is covered case by case, including `Retry-After` where defined.
- Problem bodies never contain stack traces, SQL or constraint names, even when a database error is injected.
- Money-moving routes without the idempotency header get 400; a replay returns an identical status and body with `Idempotent-Replayed`; the same key with another body gets 422; 20 concurrent identical requests produce one effect; a request still running after the bounded wait gets 409 `request_in_progress` with `Retry-After`.
- A cursor round-trips, the last page has a null `nextCursor`, a tampered cursor gets 422 and the limits are enforced.
- Money outside the safe integers is rejected.
- `X-Request-Id` is echoed or generated and present in problem bodies.
- Every route appears in the OpenAPI document with its request, response and error schemas under `/v1`; a test enumerates the routes.
- `GET /health/live` is up; `GET /health/ready` fails when PostgreSQL or Redis is unreachable.
- A graceful shutdown completes a request in flight.
- Accept invitation ignores tenant and actor headers.
- Logs contain no invitation token and no idempotency key.

---

Last updated: 2026-10-16.
