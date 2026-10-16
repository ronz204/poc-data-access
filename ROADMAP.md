# Roadmap

Build progress of poc-persists-data, one step per phase of the approach; not a changelog or a decision log.

---

## Overview

**Overall progress: 6 / 48 tasks — 13%**

| # | Step | Status | Progress |
|---|---|---|---|
| 0 | [Base infrastructure](#0--base-infrastructure) | ✅ Done | 4/4 — 100% |
| 1 | [Base migrations and Transactor](#1--base-migrations-and-transactor) | 🔄 In progress | 2/5 — 40% |
| 2 | [Repositories and product CRUD](#2--repositories-and-product-crud) | 🔲 Not started | 0/4 — 0% |
| 3 | [Basic checkout](#3--basic-checkout) | 🔲 Not started | 0/4 — 0% |
| 4 | [Concurrency](#4--concurrency) | 🔲 Not started | 0/5 — 0% |
| 5 | [Idempotency](#5--idempotency) | 🔲 Not started | 0/3 — 0% |
| 6 | [Outbox](#6--outbox) | 🔲 Not started | 0/4 — 0% |
| 7 | [Wallet](#7--wallet) | 🔲 Not started | 0/4 — 0% |
| 8 | [Row-level security](#8--row-level-security) | 🔲 Not started | 0/4 — 0% |
| 9 | [Audit trail](#9--audit-trail) | 🔲 Not started | 0/4 — 0% |
| 10 | [Read models](#10--read-models) | 🔲 Not started | 0/4 — 0% |
| 11 | [Refactor](#11--refactor) | 🔲 Not started | 0/3 — 0% |

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
- [ ] Drizzle client and Transactor registered on the DI container
- [ ] Tenant, actor and request id set per transaction, scoped to that transaction only
- [ ] Real-database test that the context does not leak between transactions

## 2 — Repositories and product CRUD

- [ ] Product table and domain entity
- [ ] Write repository running on the transaction-bound executor, with soft delete and explicit restore
- [ ] Product use cases: create, update, delete, restore
- [ ] Real-database tests for soft delete and restore

## 3 — Basic checkout

- [ ] Customer, order and order item tables
- [ ] Checkout use case creating the order and items with price and name snapshots
- [ ] Atomic stock decrement in the same transaction
- [ ] Rollback test: a failure leaves no order and no stock change

## 4 — Concurrency

- [ ] Parallel-load test harness
- [ ] Stock strategy: row lock
- [ ] Stock strategy: conditional atomic update
- [ ] Stock strategy: version check
- [ ] Comparison of the three, plus a test that parallel checkouts oversell without a strategy

## 5 — Idempotency

- [ ] Idempotency table with key, request hash and saved response
- [ ] Idempotency key handled in checkout (replay returns the stored response, a different hash is a conflict)
- [ ] Tests: replay, conflict, and concurrent requests with the same key

## 6 — Outbox

- [ ] Outbox table
- [ ] `OrderPlaced` event inserted in the checkout transaction
- [ ] Polling worker claiming batches with skip-locked row locks
- [ ] Failure test: a forced failure between commit and delivery loses no event

## 7 — Wallet

- [ ] Wallet account and ledger tables
- [ ] Wallet credit recorded by a sale
- [ ] Concurrent movements cannot overspend (lock or conditional update)
- [ ] Application role cannot update or delete ledger rows, verified by test

## 8 — Row-level security

Introduced after the problem is visible, not at the start.

- [ ] Policies on the tenant-owned tables
- [ ] Policies driven by the tenant set through the Transactor
- [ ] Isolation tests, including raw SQL on the application role
- [ ] Forced-RLS test proving a privileged role does not silently bypass the policies

## 9 — Audit trail

- [ ] Append-only audit table
- [ ] Recorder driven by the Transactor context
- [ ] Business actions audited in the same transaction, with secret values excluded
- [ ] Tests: rollback removes the entry, and the application role cannot update or delete entries

## 10 — Read models

- [ ] Seed about a million rows
- [ ] Read queries with joins and reporting views
- [ ] Keyset-paginated listings
- [ ] Query-plan comparison showing keyset flatter than offset at depth

## 11 — Refactor

- [ ] Inventory schema for stock
- [ ] Expand migration
- [ ] Contract migration, with the existing tests still passing

---

## Adding a new step

Append a new `## N — <name>` section with its own task checklist, add its row to the Overview table, and recompute **Overall** as the new total checked/total across every step. Never mark a step "Done" while an unchecked task remains under it — split the step instead of rounding up.
