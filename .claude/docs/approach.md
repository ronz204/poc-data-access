# Approach

The order and reasoning behind building the project. Why the project exists is in the overview, not here.

---

## Technical pillars

| Pillar | What it means here |
|---|---|
| Transactor with request context | One transaction owner carrying tenant and actor; row-level security, audit and the outbox all depend on it, so it comes first. |
| Real database tests | Concurrency, isolation and recovery behavior only exist in a real engine, so every pattern is verified against PostgreSQL. |
| Defense in the store | Tenant isolation, immutable ledger and append-only audit are enforced by roles and policies, so application mistakes cannot bypass them. |
| Explicit schemas and roles | Schemas per bounded context and least-privilege roles are part of the exercise, not scaffolding. |

## Functional scope

- Tenant, user, membership and invitation management
- Product catalog with soft delete and stock
- Customers and orders with checkout that decrements stock atomically
- Idempotent order creation
- Outbox events delivered by a polling worker
- Wallet with an immutable ledger credited by sales
- Audit trail of business actions
- Tenant isolation through row-level security
- Read models with joins and keyset-paginated lists over a large seeded dataset

## Roadmap

Phase 0 is done; every other phase is pending.

0. **Base infrastructure** - compose file and bootstrap scripts creating schemas, roles and grants.
1. **Base migrations and Transactor** - first migrations, the Transactor on the DI container, tenant context set per transaction.
2. **Repositories and product CRUD** - write repositories with soft delete.
3. **Basic checkout** - order, items and stock in one transaction.
4. **Concurrency** - parallel-load tests and comparison of the three stock strategies.
5. **Idempotency** - idempotency key on checkout.
6. **Outbox** - event insert in the checkout transaction and the delivery worker.
7. **Wallet** - accounts and ledger.
8. **Row-level security** - policies, isolation tests and the forced-RLS test. Introduced after the problem is visible, not at the start.
9. **Audit trail** - recorder driven by the Transactor context.
10. **Read models** - joins, reporting views and keyset pagination over about a million seeded rows, compared with offset using query plans.
11. **Refactor** - extract stock into an inventory schema with an expand then contract migration.

## Risks

- Drizzle and drizzle-kit are on a 1.0 release candidate; support for policies and multiple schemas may change or be incomplete, which pushes more work into hand-written SQL.
- Row-level security can look correct while silently bypassed when connected as a privileged role; only an explicit test catches it.

## Done criteria

- Each phase has tests against a real PostgreSQL that fail when the pattern is removed (for example, parallel checkouts oversell stock without the chosen strategy).
- A tenant cannot read or write another tenant's rows, including through raw SQL on the application role.
- A forced failure between checkout commit and event delivery loses no event and duplicates none beyond at-least-once.
- Replaying a request with the same idempotency key returns the stored response without a second effect.
- Ledger and audit rows cannot be updated or deleted by the application role.
- A keyset-paginated listing over the seeded dataset is measurably flatter than offset at depth.

## Stretch goals

- Compare database triggers against application-level audit.
- Partition the audit table by month.
- Compare snapshot versus diff storage for audit entries.

---

## Non-goals

- Dropping the wallet is the accepted way to shrink scope: every topic stays covered except the ledger and double-spend examples.
