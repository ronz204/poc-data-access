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
- Outbox events claimed by a polling worker and handed to a BullMQ queue on Redis, with a consumer
- Wallet with an immutable ledger credited by sales
- Audit trail of business actions
- Tenant isolation through row-level security
- Read models with joins and keyset-paginated lists over a large seeded dataset
- HTTP surface on Elysia in front of the use cases (planned, after the phases below)

## Roadmap

Phases 0 and 1 are done; every other phase is pending. Each phase names the slices it builds.

0. **Base infrastructure** - compose file and bootstrap scripts creating schemas, roles and grants.
1. **Base migrations and Transactor** - first migrations, the Transactor on the DI container, tenant context set per transaction.
2. **Identity** (tenant-onboarding, member-invitation) - users, tenants, memberships and invitations; admission; the Transactor operation that enters a tenant. Everything after this needs a tenant and an actor.
3. **Catalog and customers** (product-catalog, customer-records) - write repositories with soft delete and explicit restore, versioned product edits, categories.
4. **Basic checkout** (order-checkout) - order, items and stock in one transaction, with the conditional atomic update as the stock strategy.
5. **Concurrency** - parallel-load tests and the three interchangeable stock strategies compared.
6. **Idempotency** (idempotency-keys) - the idempotency wrapper, required on checkout.
7. **Outbox** (outbox-delivery) - event insert in the checkout transaction, the polling worker, Redis in the compose file, and the BullMQ queue with its consumer.
8. **Wallet** (wallet-ledger) - accounts, ledger, the sale credit inside checkout and the owner movements.
9. **Audit trail** (audit-recording) - recorder driven by the Transactor context, applied to the actions of every earlier slice, and the trail read.
10. **Row-level security** - policies and isolation tests run as the application role, including the dedicated read paths. Introduced after the problem is visible, not at the start.
11. **Read models** (sales-reporting) - the read-only `reader` role, reporting views with a tenant predicate and one refreshed materialized view, joins and keyset pagination over about a million seeded rows, compared with offset and live aggregates using query plans.
12. **Refactor** (stock-inventory) - extract stock into an inventory schema with an expand then contract migration: dual-write, backfill, verification, an authority switch and the final contract, with the existing tests passing at every step.
13. **HTTP endpoints (planned)** (http-endpoints) - Elysia routes over the use cases: idempotency header, simulated tenant and actor context, zod validation at the boundary, error mapping.

Checkout grows by steps. Phase 4 builds the validation, the stock reservation and the order; idempotency, the outbox event, the wallet credit and the audit entry are added by their own phases, and the acceptance criteria that mention them are checked then. Slices built before the audit and row-level-security phases gain their audit calls and policies when those phases land. The slice http-endpoints has no spec yet.

## Risks

- Drizzle and drizzle-kit are on a 1.0 release candidate; support for policies and multiple schemas may change or be incomplete, which pushes more work into hand-written SQL.
- Row-level security can look correct while silently bypassed when connected as a privileged role; only an explicit test catches it.
- Once the outbox marks an event delivered, the queue is the only holder of the job, so the no-loss guarantee holds only as far as Redis persistence does; the append-only setting has to be verified, not assumed.

## Done criteria

- Each phase has tests against a real PostgreSQL that fail when the pattern is removed (for example, parallel checkouts oversell stock without the chosen strategy).
- A tenant cannot read or write another tenant's rows, including through raw SQL on the application role.
- A forced failure between checkout commit and the event reaching the queue loses no event and duplicates none beyond at-least-once.
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
