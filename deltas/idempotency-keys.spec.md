# Idempotency Keys — Spec

> A reusable mechanism that lets a client retry a state-changing request safely: the effect happens at most once and the client always gets the same answer.

## Intent

Networks time out and users double-click. A client that did not see an answer has to be able to send the same request again without buying twice, and a client that sends the same request twice at the same moment must not cause two effects. The key and a hash of the request identify one logical operation; the first execution wins and everyone else gets its result.

## Scope

Owns:

- A generic wrapper around a write use case: operation name, key, validated payload, and the work to run.
- The table `messaging.idempotency`.

Today only checkout uses it; the order-checkout slice places the key resolution at the start of its unit of work and the response storage at the end. Any other write use case may adopt it, and each slice's spec says whether it requires a key.

Non-goals:

- HTTP concerns, such as reading the header or choosing status codes.
- Deciding which use cases require a key.
- Caching reads.
- Storing failed outcomes.
- Key expiry and cleanup.
- Rate limiting.

## Contract

### Record

```
messaging.idempotency(
  tenant_id    uuid not null -> platform.tenants,
  key          text not null,
  request_hash text not null,
  response     jsonb,
  created_at   timestamptz not null,
  primary key (tenant_id, key)
)
```

The record is created without a response at the start of the unit of work and completed at the end of it. Other transactions never see it in between: it is uncommitted until the whole unit of work commits, so a committed record always has a response.

### Key

- A client-supplied string. (Assumed default format: 8 to 128 characters from `[A-Za-z0-9_-]`.) An invalid key is rejected as an input error before any database work.
- Scoped by tenant only: the same key in two tenants is unrelated, and within a tenant all members share the key space. (Assumed default.)
- The use case's admission and permission checks run before the key is resolved, so a replay returns the stored response only to an actor allowed to run the operation.

### Request hash

SHA-256 (hex) over the operation name plus the validated payload in canonical form:

- object keys sorted;
- collections that are semantically unordered, such as checkout lines, sorted by their identifying field, such as the product id.

Reordering lines does not change the hash; changing the customer, a product or a quantity does. Because the operation name is part of the hash, reusing a key for a different operation is also a conflict.

### Flow

Inside the use case's unit of work:

1. Insert the record with the key and hash, ignoring a conflict (`INSERT ... ON CONFLICT DO NOTHING`).
2. If the row was inserted, run the work, set the response on the record, and commit.
3. If the insert hit a conflict, read the existing record:
   - if its hash differs, fail with an idempotency conflict error (the key was reused for a different request);
   - if the hash is equal, return the stored response without running anything.

### Concurrency

When two identical requests arrive at once, the second insert waits on the first's unique index entry until the first transaction ends.

- If the first commits, the second sees the conflict, reads the committed record and returns the same stored response.
- If the first rolls back, the second's insert succeeds and it runs the work.

The work behind a key never runs twice.

### Failures

Only successes are stored. A failed request rolls back everything, including the key record, so retrying with the same key runs again and returns the current result or error. A failed outcome is never replayed.

### Response

The success result of the use case, serialized as JSON, returned unchanged on every replay. (Assumed default.)

### Retention

Records are kept without expiry.

### Side effects of a replay

None. A replay writes no stock change, order, ledger entry, event or audit entry. The key resolution itself is not audited; the audit entry belongs to the business action.

### Current state

Design only: there is no model, migration or code for the idempotency table or wrapper yet.

## Invariants

- At most one record exists per tenant and key.
- A committed record always has a response, and is never modified afterward. The mechanism that enforces the second part (a policy, a trigger, or convention plus tests) is left to implementation.
- The work behind a key runs at most once.
- The stored response is returned verbatim on every replay.
- The same key with a different request hash never runs the work and never returns the stored response.
- A rolled-back request leaves no record.
- A replay has no side effects.
- A tenant cannot read or collide with another tenant's records (row-level security, roadmap phase 8).

## Deferred / Open questions

- Retention: expiry (for example after 24 hours), cleanup, and key reuse afterward.
- Whether deterministic failures should ever be replayed.
- Whether keys should be scoped per actor instead of per tenant.
- How committed records are made immutable.
- Storing the original request for debugging.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced:

- The first request runs the work and stores the hash and the response.
- A replay with the same key and payload returns the identical response, with no second order, decrement, credit, event or audit entry.
- The same key with a different payload, or for a different operation, fails with an idempotency conflict and runs nothing.
- Checkout lines in a different order produce the same hash and count as the same request.
- 20 identical concurrent requests (`Promise.all`) with the same key produce exactly one execution, and all receive the same response.
- If the first of two concurrent requests rolls back, the second runs the work.
- A failed request leaves no record, and the same key can be retried.
- An invalid key is rejected before any database work.
- The same key in two tenants is independent.
- A non-member cannot obtain a stored response by replaying.
- The stored response equals what the first call returned (JSON equality).
- A committed record cannot be modified through the application role, or no update path exists once the unit of work has committed.

---

Last updated: 2026-10-15.
