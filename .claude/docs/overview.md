# Overview

What this project is for, what it owns, and the domain vocabulary the rest of the knowledge base assumes. Component behavior and topology are deliberately not covered here.

---

## Vision

A proof of concept for learning and testing data-persistence patterns with Drizzle ORM on PostgreSQL. The patterns are exercised on a realistic domain instead of isolated toy examples: a multi-tenant mini online store (catalog, customers, orders) with an internal wallet that credits the sales. The domain is chosen so that every pattern has a natural reason to exist, with none bolted on.

The patterns under study:

- Transactor manager built on a DI container and Drizzle
- Repositories plus CQRS lite (write-side repositories, separate read queries)
- Audit trail written by the application, not by database triggers
- Concurrency control (stock decrement, wallet double spend)
- Idempotent writes
- Transactional outbox
- Soft delete
- Schema migrations, generated and hand-written
- Multi-tenancy enforced by row-level security
- Keyset (cursor) pagination
- Read models with non-trivial joins

The code is a learning vehicle: clarity of each pattern and the ability to test it against a real database matter more than feature breadth.

## Scope & non-goals

Owned by the project:

- A PostgreSQL database split into schemas by bounded context, with roles and grants provisioned from scripts
- The data-access layer, repositories, read queries, and use cases that exercise each pattern
- Tests that run against a real PostgreSQL instance (concurrency, isolation and recovery cannot be verified against a mock)

Explicit non-goals:

- Real authentication: the acting user and tenant are simulated per request
- Any frontend
- A real message broker: the outbox publishes to a log or a fake webhook
- Production hosting, environments beyond local containers, or operations concerns

## Domain concepts

| Concept | Description |
|---|---|
| Tenant | A store. The root of data ownership; every business row belongs to exactly one tenant. |
| User and membership | A person and their role inside a tenant. Users reach tenant data through memberships. |
| Invitation | An offer for an email address to join a tenant with a role. Accepting it creates the membership, and the user itself if none exists yet. |
| Product | A sellable item owned by a tenant. Holds price and stock, supports soft delete, carries a version for optimistic locking. |
| Category | Grouping of products within a tenant. |
| Customer | A buyer of a tenant. Supports soft delete. |
| Order and item | A purchase and its lines. Items snapshot the product name and price at purchase time. |
| Wallet account and entry | A tenant balance and its immutable ledger of movements, credited when sales complete. |
| Outbox event | A domain event recorded atomically with the change that caused it, delivered later by a worker. |
| Idempotency record | The stored outcome of a request identified by an idempotency key, replayed on retry. |
| Audit trail entry | An append-only record of who did what to which entity, with a field-level diff. |
| Read model | A query-optimized projection (views) used only for reads. |
