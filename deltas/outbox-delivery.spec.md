# Outbox Delivery — Spec

> Every event recorded by a committed change eventually reaches the queue, so work that must follow a commit never depends on the request path and is never lost.

## Intent

Some work must happen only if a change committed: telling other parts of the system about an order, updating a projection, calling an integration. Doing it inline either runs it for a change that later rolls back, or loses it when the process dies right after commit. Recording the event in the same transaction as the change, and handing it to a queue afterwards, makes the event exist if and only if the change does, and makes its delivery survive crashes, at the price of delivering some events more than once.

## Scope

Owns:

- The event record: the contract of `messaging.events` and how a use case records an event inside its unit of work. Each slice names its own event types; this slice defines the mechanism.
- The outbox worker: claim, enqueue, mark delivered, retry with backoff, and the failed state.
- The queue consumer contract: a BullMQ queue on Redis whose jobs are keyed by event id. The initial consumer logs the event or calls a fake webhook.

Non-goals:

- Deciding which events each slice emits.
- Real downstream integrations.
- Ordering guarantees across events.
- Event versioning or a schema registry.
- Exactly-once delivery.
- The HTTP layer.
- Purging delivered events.
- Dashboards.

## Contract

### Event record

```
messaging.events(
  id             uuid primary key,
  tenant_id      uuid not null -> platform.tenants,
  type           text not null,
  payload        jsonb not null,
  reference_type text not null,        -- origin of the event, no foreign key
  reference_id   uuid not null,
  created_at     timestamptz not null,
  delivered_at   timestamptz null,     -- set when the queue accepted the job
  attempts       integer not null default 0,
  next_attempt_at timestamptz null,
  last_error     text null,
  failed_at      timestamptz null
)
partial index on undelivered, non-failed rows, for the polling query
```

A use case records an event inside the business transaction. The tenant comes from the context. Event types are PascalCase past-tense names, for example `OrderPlaced`. (Assumed default.) The columns `attempts`, `next_attempt_at`, `last_error` and `failed_at` are planned for the retry policy below.

### Worker process

A separate entry point, running on the `relayer` role, which bypasses row-level security and therefore sees every tenant's events. It runs a polling loop with a configurable batch size and interval, and shuts down gracefully on a signal by finishing the current batch before exiting. Several workers may run at the same time.

### Claim protocol

One open transaction per batch:

1. Select due events: undelivered, not failed, and `next_attempt_at` null or in the past. Order by `(created_at, id)`, limit to the batch size, and lock with `FOR UPDATE SKIP LOCKED`.
2. For each claimed event, add a job to the BullMQ queue with the event id as the job id.
3. When Redis acknowledges the job, set `delivered_at`.
4. Commit.

If the worker dies before committing, the locks are released and another worker claims the same events again. The queue ignores a second job with the same id while the first still exists, and consumers tolerate the duplicates that remain. The transaction stays open while jobs are enqueued; that is an accepted trade-off, so batches are kept small. Each enqueue is bounded by a timeout (assumed default: a few seconds), and a timeout counts as a failed enqueue; the claim transaction also has its own timeout. Otherwise an unresponsive Redis would hold the row locks and the database connection indefinitely.

### Retry policy

(Assumed defaults.)

- A failed enqueue increments `attempts`, stores `last_error`, and sets `next_attempt_at` with exponential backoff: a base delay of a few seconds, doubling, capped.
- After a configurable maximum number of attempts (default 10), `failed_at` is set. The event is no longer claimed and stays visible for manual review.
- A failure for one event does not block the others in the batch: its row is updated in the same transaction and the rest proceed.

### What "delivered" means

`delivered_at` means the queue accepted the job, not that anyone processed it. From then on BullMQ owns the consumer-side retries, through job attempts and backoff configured on the queue. Redis has to persist to disk (append-only file); otherwise jobs it already accepted can be lost, and the no-loss guarantee only holds as far as that persistence does. This is a known risk to verify rather than assume.

### Consumer

A separate process takes jobs from the queue and handles them by event type. The initial handler logs the event or sends it to a fake webhook. Handling is idempotent per event id, so a duplicate delivery has no second effect. BullMQ's attempts and backoff cover failures. Finished jobs are kept for a limited time or count and then removed. (Assumed default.) Removing a finished job lets the same event id be enqueued again later, which is one source of duplicates.

### Ordering and retention

- No ordering is guaranteed across events or workers. Events are claimed oldest first on a best-effort basis, and consumers must not depend on order.
- Delivered events are kept without expiry.

### Privileges

- `runner` inserts events inside business transactions and needs no update or delete on them.
- `relayer` reads events and updates only the delivery columns (`delivered_at`, `attempts`, `next_attempt_at`, `last_error`, `failed_at`), through a column-level grant on `messaging.events`. It has no access to the other messaging tables.
- These grants replace the schema-wide defaults that today give `relayer` select and update on every messaging table and `runner` update and delete on events.

### Audit and logging

Delivery is not audited per event: it is operational, not a business action. The worker logs batches and failures.

### Current state

There is no model, migration or code for events. Redis is already part of the compose file, with append-only persistence, per-user ACL passwords, the destructive commands disabled and a memory ceiling with no eviction; the queue clients connect through the `BULL_REDIS_URL` setting. The `relayer` role and its connection setting already exist; it currently has only `USAGE` on the schema, and receives its column-level grant from the migration that creates the events table.

## Invariants

- An event exists if and only if the change that produced it committed.
- Every committed event is eventually either delivered (accepted by the queue) or marked failed after bounded attempts; none is silently dropped.
- An event is never claimed by two workers at the same time.
- A delivered or failed event is never claimed again.
- `delivered_at` is set only after the queue acknowledged the job.
- The job id is the event id, so the queue deduplicates while the job exists.
- Delivery is at least once, and consumers tolerate duplicates.
- A failing event does not block the other events.
- Every event keeps its tenant, and its payload never contains secrets (the same rule as audit metadata).

## Deferred / Open questions

- Purge or archive of delivered and failed events.
- Redis persistence and high-availability configuration.
- Whether per-aggregate ordering is ever needed.
- A replay tool for failed events.
- Metrics for pending and failed counts.
- Event schema versioning.

## Acceptance criteria

Integration tests against a real PostgreSQL and Redis, using vitest once it is introduced:

- Recording an event in a transaction that rolls back leaves no event.
- A committed event is claimed and enqueued with the event id as the job id, and `delivered_at` is set only after the enqueue was acknowledged.
- Killing the worker after the enqueue but before the commit makes the event be claimed again; the queue deduplicates by id and `delivered_at` ends up set exactly once.
- Several workers running concurrently never claim the same event, each event is enqueued once, and all events are processed.
- An enqueue failure (Redis unavailable) increments `attempts`, sets `next_attempt_at` with backoff and stores `last_error`, while the other events in the batch proceed.
- After the maximum attempts the event is marked failed and never claimed again; a delivered event is never claimed again.
- The claim respects `next_attempt_at` and the batch size.
- An enqueue that hangs past its timeout counts as a failed enqueue, and the worker releases its locks.
- The relayer cannot update `messaging.idempotency` or any column of an event other than the delivery columns; the application role cannot update or delete events.
- A graceful shutdown finishes the current batch.
- The consumer processes each event id once and handles a duplicate delivery without a second effect.
- The relayer sees events of every tenant, while the application role sees only its own tenant's (row-level security, roadmap phase 8).
- A restart of Redis with append-only persistence enabled keeps the accepted jobs.

---

Last updated: 2026-10-15.
