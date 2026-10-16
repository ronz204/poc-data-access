# Roadmap

Build progress of poc-persists-data, one step per phase of the approach; not a changelog or a decision log.

---

## Overview

**Overall progress: 13 / 78 tasks — 17%**

| # | Step | Status | Progress |
|---|---|---|---|
| 0 | [Base infrastructure](#0--base-infrastructure) | ✅ Done | 4/4 — 100% |
| 1 | [Base migrations and Transactor](#1--base-migrations-and-transactor) | ✅ Done | 5/5 — 100% |
| 2 | [Identity](#2--identity) | 🔄 In progress | 1/7 — 14% |
| 3 | [Catalog and customers](#3--catalog-and-customers) | 🔲 Not started | 0/5 — 0% |
| 4 | [Basic checkout](#4--basic-checkout) | 🔲 Not started | 0/5 — 0% |
| 5 | [Concurrency](#5--concurrency) | 🔲 Not started | 0/6 — 0% |
| 6 | [Idempotency](#6--idempotency) | 🔲 Not started | 0/4 — 0% |
| 7 | [Outbox](#7--outbox) | 🔄 In progress | 1/9 — 11% |
| 8 | [Wallet](#8--wallet) | 🔲 Not started | 0/7 — 0% |
| 9 | [Audit trail](#9--audit-trail) | 🔄 In progress | 1/5 — 20% |
| 10 | [Row-level security](#10--row-level-security) | 🔲 Not started | 0/5 — 0% |
| 11 | [Read models](#11--read-models) | 🔄 In progress | 1/6 — 17% |
| 12 | [Refactor](#12--refactor) | 🔲 Not started | 0/5 — 0% |
| 13 | [HTTP endpoints](#13--http-endpoints) | 🔲 Not started | 0/5 — 0% |

Status legend: 🔲 Not started · 🔄 In progress · ✅ Done (only once every task under it is checked).

---

## 0 — Base infrastructure

PostgreSQL with schemas, roles and grants ready before any code touches it.

- [x] Compose file for PostgreSQL
- [x] Bootstrap scripts for roles, stores, schemas and grants
- [x] Database lifecycle scripts (`db:up`, `db:down`, `db:reset`)
- [x] `db:check` verifying roles, schemas and grants

## 1 — Base migrations and Transactor

The Transactor comes first: row-level security, audit and the outbox all depend on it.

- [x] drizzle-kit config and migration workflow
- [x] First migrations: base tables for tenants, users, memberships and invitations
- [x] Drizzle client and Transactor registered on the DI container
- [x] Tenant, actor and origin set per transaction, scoped to that transaction only
- [x] Real-database test that the context does not leak between transactions

## 2 — Identity

Slices: tenant-onboarding, member-invitation. Everything after this needs a tenant and an actor.

- [x] Memberships migration: own id, `removed_at`, unique active membership per tenant and user
- [ ] Email value object and sign-up
- [ ] Create tenant: tenant and owner membership atomically
- [ ] Member management: change role, remove, leave, with last-owner protection under the tenant lock
- [ ] Admission use case and read model
- [ ] Invitations: invite, accept, revoke, list
- [ ] Real-database tests: last owner under concurrent demotions, single-use invitation under concurrent accepts

## 3 — Catalog and customers

Slices: product-catalog, customer-records.

- [ ] Catalog tables: categories and products with the composite foreign key, checks and partial unique index
- [ ] Product and category repositories and use cases: create, edit with version, adjust stock, delete, restore
- [ ] Customer table and use cases, with soft delete and explicit restore
- [ ] Keyset-paginated lists of products and customers, with include-deleted for owner and admin
- [ ] Real-database tests: soft delete, restore conflicts, stale version, stock never negative

## 4 — Basic checkout

Slice: order-checkout, without idempotency, outbox, wallet and audit steps.

- [ ] Order and item tables with composite foreign keys
- [ ] Checkout use case: validation with the customer share lock, order and items with price and name snapshots
- [ ] Atomic stock reservation (conditional atomic update) in the same transaction, lines ordered by product id
- [ ] Get order and list orders
- [ ] Rollback test: a failure leaves no order and no stock change

## 5 — Concurrency

- [ ] Parallel-load test harness
- [ ] Stock reservation port, with the conditional atomic update as the default
- [ ] Stock strategy: row lock
- [ ] Stock strategy: version check on the stock version, with bounded retry
- [ ] Comparison of the three, plus a test that parallel checkouts oversell without a strategy
- [ ] Test that a product deleted mid-checkout is not sold

## 6 — Idempotency

Slice: idempotency-keys.

- [ ] Idempotency table with key, request hash and saved response
- [ ] Wrapper for write use cases: insert-first, canonical request hash, bounded lock wait
- [ ] Idempotency key required in checkout
- [ ] Tests: replay, conflict, concurrent requests with the same key, rollback leaves no record

## 7 — Outbox

Slice: outbox-delivery.

- [ ] Outbox table with retry columns
- [x] Redis in the compose file, with append-only persistence, ACL users and its connection setting (`BULL_REDIS_URL`)
- [ ] BullMQ queue wired to that connection
- [ ] `OrderPlaced` event inserted in the checkout transaction
- [ ] Polling worker claiming batches with skip-locked row locks, enqueueing with the event id as job id, with timeouts
- [ ] Retry with backoff and the failed state
- [ ] Queue consumer, idempotent per event id
- [ ] Privileges: insert-only for the application role, column-level update for the relayer
- [ ] Failure tests: a forced failure between commit and enqueue loses no event, two workers never claim the same event, a Redis restart keeps the accepted jobs

## 8 — Wallet

Slice: wallet-ledger.

- [ ] Wallet account and entry tables, one account per tenant
- [ ] Lazy account creation and the sale credit inside the checkout transaction (a zero total writes no entry)
- [ ] Withdrawal, adjustment and reversal for the owner, with idempotency key
- [ ] Balance protected by the conditional update: concurrent movements cannot overspend
- [ ] Application role cannot update or delete ledger rows and can update only the balance columns, verified by test
- [ ] Reconciliation check and tests: balance equals the sum of the entries
- [ ] Wallet reads for owner and admin

## 9 — Audit trail

Slice: audit-recording. The trail table already exists, created by the second platform migration.

- [x] Trail limited to actions inside a tenant: tenant required, actor optional
- [ ] Recorder driven by the Transactor context, with per-action allowlists
- [ ] Business actions of every earlier slice audited in the same transaction, with secret values excluded
- [ ] Trail read query for owner and admin
- [ ] Tests: rollback removes the entry, the application role cannot update or delete entries, an entry without a tenant is rejected, signing up and creating a tenant write no entry

## 10 — Row-level security

Introduced after the problem is visible, not at the start.

- [ ] Policies on the tenant-owned tables; immutable tables get select and insert policies only
- [ ] Policies driven by the tenant set through the Transactor
- [ ] Dedicated read paths for admission and for the invitation token lookup
- [ ] Isolation tests, including raw SQL on the application role
- [ ] Forced-RLS test proving a privileged role does not silently bypass the policies

## 11 — Read models

Slice: sales-reporting.

- [x] `reader` role in the bootstrap scripts and its connection setting; `runner` loses its read on `reporting`
- [ ] Seed about a million rows
- [ ] Reporting views with a tenant predicate and security barrier, and one materialized view with a throttled concurrent refresh
- [ ] Reports: sales per product and month, top customers by revenue, low stock and rotation, keyset-paginated where they list
- [ ] Isolation tests as `reader`: only the reporting views, only the current tenant's rows
- [ ] Query-plan comparison: materialized against live, and keyset flatter than offset at depth

## 12 — Refactor

Slice: stock-inventory.

- [ ] Expand: inventory schema and stock table, with privileges and the composite foreign key
- [ ] Dual-write in the application and batch backfill
- [ ] Consistency check reporting zero differences under concurrent load
- [ ] Switch authority to inventory, reversible by flipping the reads back
- [ ] Contract migration dropping the old columns, with the existing tests still passing

## 13 — HTTP endpoints

Slice: http-endpoints. Routes are added slice by slice as each use case lands.

- [ ] Elysia application with the simulated tenant and actor context and the admission check
- [ ] Routes over the use cases, with the idempotency header on the money-moving ones
- [ ] zod validation at the boundary, problem+json error mapping and the pagination envelope
- [ ] OpenAPI document generated from the route schemas, and the health endpoints
- [ ] Tests over HTTP, including the error table and graceful shutdown

---

## Adding a new step

Append a new `## N — <name>` section with its own task checklist, add its row to the Overview table, and recompute **Overall** as the new total checked/total across every step. Never mark a step "Done" while an unchecked task remains under it — split the step instead of rounding up.
