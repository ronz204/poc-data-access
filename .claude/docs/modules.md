# Modules

Functional reference for the components the project builds. Only the Transactor is implemented; the other sections record intended behavior and are updated in place as each component lands. Why the components exist lives in the overview, not here.

---

## Transactor

**Purpose.** The single place that opens, commits and rolls back database transactions, and that carries per-request context (tenant, actor, origin) into the database session.

**Flow.**
1. A caller asks the Transactor to run a unit of work, passing a context, the DI token of the entry service and the work to run on it.
2. The Transactor begins a transaction and writes tenant, actor and origin as transaction-local settings (`app.tenant`, `app.actor`, `app.origin`) in one statement; an absent value is written as an empty string.
3. It opens a DI scope bound to that transaction, with the transaction-bound executor and the context, and resolves the entry service from it, so repositories and queries receive the executor instead of opening their own.
4. On success the audit entries and outbox events recorded during the unit of work commit together with the business changes; on failure everything rolls back. Driver errors leave the Transactor classified as persistence errors.
5. A run never nests: a use case that needs several writes calls the Transactor once and passes the unit of work down.

**Data shape.**
```
context (built only through these three constructors):
  tenant(tenantId, actorId, origin = "request")   authenticated request inside a tenant
  platform(actorId, origin = "request")            authenticated user, no tenant
  system(origin, tenantId?)                         worker or anonymous flow, no actor

fields: tenantId | null, actorId | null, origin (never blank)
strict reads: tenant, actor -> the id, or a transaction scope error when absent
```

**Errors.** A persistence error carries a kind (unique, foreign key, not null, check, exclusion, invalid input, forbidden, aborted, contention, timeout, unavailable), the SQLSTATE code, table, column and constraint, and whether it is retryable. A repository can translate a known constraint name into a domain error of its own; anything not mapped stays a persistence error.

**Dependencies.** Built on the DI container and the Drizzle client. Everything that writes depends on it.

## Repositories and read queries

**Purpose.** Write-side repositories persist one aggregate each. Read queries serve lists and reports directly from SQL without loading aggregates (CQRS lite).

**Flow.**
1. Repositories map between domain entities and table rows and always run on the transaction-bound executor.
2. Soft-deleted rows are excluded by default; restoring is an explicit operation.
3. Read queries return view models, paginate with a keyset cursor, and may read the reporting views.

## Checkout

**Purpose.** Create an order, its items and the stock decrement atomically, then record the outbox event and the wallet credit.

**Flow.**
1. Validate the request and resolve the idempotency record.
2. Decrement stock using the strategy under evaluation (row lock, conditional atomic update, or version check).
3. Insert order and items with price and name snapshots.
4. Insert the `OrderPlaced` outbox event and the audit entry.
5. Commit, then store the response against the idempotency key.

## Idempotency

**Purpose.** Make a repeated write request safe to retry.

**Flow.**
1. The request carries an idempotency key; the stored record keeps the key, a hash of the request and the saved response.
2. Same key and same hash returns the saved response; same key with a different hash is rejected as a conflict.
3. Two concurrent requests with the same key are serialized by a unique constraint, so only one executes.

## Outbox worker

**Purpose.** Hand the events recorded in the outbox to the queue as often as needed to never lose one, tolerating duplicates.

**Flow.**
1. In one open transaction on the relayer role, claim a batch of due, undelivered events with row locks that skip rows already claimed by another worker.
2. For each event, add a job to the BullMQ queue using the event id as the job id, so the queue also deduplicates by id.
3. Mark the event delivered once Redis has acknowledged the job, then commit. If the worker dies before committing, the locks fall and another worker claims the batch again.
4. A failed enqueue increments the event's attempt counter and schedules the next attempt with exponential backoff; after the maximum number of attempts the event becomes failed, stops being claimed and stays visible for review.

The worker is a separate process with a polling loop of configurable batch size and interval, and it shuts down gracefully on a signal. Delivered events are kept without expiry.

## Queue consumer

**Purpose.** Process the jobs the outbox worker enqueued.

**Flow.**
1. A separate process takes jobs from the BullMQ queue.
2. It handles each job (initially logging it or calling a fake webhook), with BullMQ's own attempts and backoff for failures.
3. Jobs can be delivered more than once, so handling must be idempotent per event id.

## Audit trail

**Purpose.** Answer who did what, to which entity, and when, without database triggers.

**Flow.**
1. The Transactor's context supplies tenant, actor and origin.
2. A recorder writes one entry per audited action inside the same transaction as the change, so a rollback removes the entry too.
3. Entries hold an action name (`entity.verb`), entity type and id, and metadata about the change; secret values are never stored.
4. Row-level security only lets the application insert an entry whose tenant, actor and origin match the transaction settings, and read entries of the current tenant; entries are never updated or deleted.

**Data shape.**
```
trailer: tenant (nullable), actor (nullable), origin, action, entity type, entity id, metadata, transaction id, occurred at
```

An entry without an actor comes from a system run; its origin says which process wrote it. An entry without a tenant belongs to an action that has none, such as signing up a user.

## Wallet ledger

**Purpose.** Hold tenant balances as an immutable, append-only ledger of entries.

**Flow.**
1. A movement inserts an entry referencing its origin by type and id, with no foreign key to the origin.
2. Balance changes use a lock or conditional update so concurrent movements cannot overspend.
3. Entries are never updated or deleted.

---

## Non-goals

- Not a reference for schema or role details; those live in the persistence reference.
