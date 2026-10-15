# Modules

Functional reference for the components the project builds. None are implemented yet: this file records each component's intended behavior and is updated in place as each one lands. Why the components exist lives in the overview, not here.

---

## Transactor

**Purpose.** The single place that opens, commits and rolls back database transactions, and that carries per-request context (tenant, actor, request id) into the database session.

**Flow.**
1. A use case asks the Transactor to run a unit of work.
2. The Transactor begins a transaction and sets the tenant on the session, scoped to that transaction only.
3. Repositories and queries resolve the transaction-bound executor from the Transactor instead of opening their own.
4. On success the audit entries and outbox events recorded during the unit of work commit together with the business changes; on failure everything rolls back.

**Data shape.**
```
context: { tenantId, actorId, requestId }
```

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

**Purpose.** Deliver events recorded in the outbox exactly as often as needed to never lose one, tolerating duplicates.

**Flow.**
1. Poll for undelivered events, claiming a batch with row locks that skip rows already claimed by another worker.
2. Publish each event to the configured sink (log or fake webhook).
3. Mark delivered rows; unclaimed or failed rows stay pending and are retried.

## Audit trail

**Purpose.** Answer who did what, to which entity, and when, without database triggers.

**Flow.**
1. The Transactor's context supplies tenant, actor and request id.
2. A recorder writes one entry per audited action inside the same transaction as the change, so a rollback removes the entry too.
3. Entries hold an action name, entity type and id, and a diff of changed fields; secret values are never stored.

**Data shape.**
```
trailer: tenant, actor, request id, action, entity type, entity id, diff, created at
```

## Wallet ledger

**Purpose.** Hold tenant balances as an immutable, append-only ledger of entries.

**Flow.**
1. A movement inserts an entry referencing its origin by type and id, with no foreign key to the origin.
2. Balance changes use a lock or conditional update so concurrent movements cannot overspend.
3. Entries are never updated or deleted.

---

## Non-goals

- Not a reference for schema or role details; those live in the persistence reference.
