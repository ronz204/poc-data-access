# Expertise

How the PostgreSQL mechanisms the project depends on actually behave. Where they are used and who owns them lives elsewhere.

---

## Glossary

| Term | Meaning |
|---|---|
| RLS | Row-level security: per-row policies the engine applies to every statement on a table. |
| Keyset pagination | Paging by "rows after this sort key" instead of by row count skipped. |
| Outbox | A table of events written in the same transaction as the change, delivered afterwards. |
| Ledger | Append-only record where state is derived from entries, never overwritten. |

## Row-level security and tenant context

A policy is a predicate added to every statement on the table. With the tenant stored in a session setting, the policy compares the row's `tenant_id` to that setting. `SET LOCAL` scopes the setting to the current transaction and reverts at commit or rollback, which matters with pooled connections: a plain `SET` would leak one tenant's value into the next borrower of the connection.

Caveats that trip people up:

- Table owners and superusers bypass policies unless the table has `FORCE ROW LEVEL SECURITY`; superusers and roles with the bypass attribute ignore it even then. Connecting as the wrong role silently disables isolation.
- An unset setting returns an empty string or null depending on how it is read; policies must treat "no tenant" as "no rows", not "all rows".
- `INSERT` and `UPDATE` need a check expression as well as a using expression, or a tenant could write rows it cannot read back.

## Concurrent stock decrement

Three ways to keep stock from going negative under parallel checkouts:

| Strategy | Mechanism | Trade-off |
|---|---|---|
| Row lock | Select the row `FOR UPDATE`, check, then update | Simple and correct; serializes writers on the row and holds the lock across application code. |
| Conditional atomic update | `UPDATE ... SET stock = stock - n WHERE stock >= n` and check affected rows | Shortest lock window, no read step; the check is in the statement itself. |
| Optimistic version | Update `WHERE version = v`, retry if no row matched | No locks held while reading; costs retries under contention. |

At the default `READ COMMITTED` isolation a read-then-write without a lock is a race; this is the failure the comparison exists to demonstrate.

## Transactional outbox with SKIP LOCKED

Writing the event in the business transaction removes the dual-write problem: either both the change and the event exist or neither does. Delivery then happens after commit, so it is at least once: a worker can publish and crash before marking the row delivered, and the event is published again. Consumers must tolerate duplicates.

`FOR UPDATE SKIP LOCKED` lets several workers claim different pending rows without blocking each other; locked rows are skipped, not waited for. Ordering across workers is not guaranteed.

When the sink is a queue, "delivered" means the queue accepted the job, not that anything processed it. From that point the queue owns the job, so the guarantee is only as durable as the queue's storage: a Redis instance without append-only persistence can lose accepted jobs after a restart. Using the event id as the job id makes the queue ignore a second job with the same id while the first one is still stored, which removes most duplicates after a worker crash; it does not remove all of them (a finished job that the queue has already discarded can be enqueued again), so consumers must still tolerate duplicates.

## Idempotency keys

The key plus a hash of the request identify one logical operation. A unique constraint on the key decides the winner when two identical requests race: the loser fails or waits and then reads the stored response. The hash distinguishes a legitimate retry from key reuse with a different body, which must be rejected.

## Views, materialized views and tenant isolation

A view runs with the privileges of its owner, not of the caller, unless it is created as invoker-rights. When the owner is the migration role, which skips row-level security, a view over tenant tables returns every tenant's rows to anyone who can select from it. A materialized view is worse: it stores the rows, cannot carry policies and has no invoker mode. So reporting protects itself in the definition: the exposed view filters on the tenant setting, and the security-barrier option stops the planner from moving a caller's predicates ahead of that filter, where a leaky function could expose rows. Materialized views stay internal and are read only through such views.

A materialized view is a snapshot: it is only as fresh as its last refresh. `REFRESH MATERIALIZED VIEW CONCURRENTLY` rebuilds it without blocking readers and keeps the old contents if it fails, but it requires a unique index on the view and recomputes everything, which for a shared view means every tenant's rows.

## Keyset pagination

`OFFSET n` makes the database walk and discard `n` rows, so cost grows with page depth, and rows inserted between page requests shift the window. Keyset filters on the sort key of the last row seen, `WHERE (created_at, id) < (:c, :i)` with a matching index, so cost is flat and pages are stable. The id tiebreaker is required because timestamps are not unique.

---

## Non-goals

- Not a tutorial on Drizzle's API.
