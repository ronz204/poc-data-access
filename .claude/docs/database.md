# Database

The PostgreSQL design for the project: schemas, roles, data model, invariants and access conventions. The schema is the target design; no migration has been applied yet.

---

## Schema

Postgres schemas are split by bounded context, not by table type, so the namespaces mirror the code modules and the read/write split.

| Schema | Tables | Notes |
|---|---|---|
| `platform` | `tenants`, `users`, `memberships` | Identity and tenancy. `tenants` is the root and carries no row-level policy. |
| `catalog` | `products`, `categories` | `products` has soft delete, stock and a version column. Owner of stock. |
| `sales` | `customers`, `orders`, `items` | `customers` has soft delete. `items` snapshots product name and price. |
| `wallet` | `accounts`, `entries` | `entries` is an immutable ledger. |
| `messaging` | `events`, `idempotency` | `events` is the outbox. `idempotency` stores key, request hash and response. |
| `audit` | `trailer` | Append-only for the application; candidate for monthly partitioning. |
| `reporting` | views, materialized views | Read-only projections for the query side. |

All objects are referenced with their schema. The migration journal lives in its own schema, away from the domain.

## Access control

| Role | Purpose | Used by |
|---|---|---|
| `migrator` | Owns every object; bypasses row-level security. | Migration tooling only |
| `app_rw` | Reads and writes catalog, sales, wallet and messaging; insert-only on `audit.trailer`; insert and select only on `wallet.entries`. Subject to row-level security. | Application writes |
| `app_reader` | Select on `reporting` only. Subject to row-level security. | Read queries |

The split prevents the application from altering schema, rewriting history (audit, ledger) or escaping tenant isolation. A table owner skips row-level security unless the table forces it, so the application never connects as the owner, and tables use `FORCE ROW LEVEL SECURITY`; a test must verify the isolation actually holds.

Tenant isolation: every transaction sets `app.tenant_id` locally, and each tenant-scoped table has a policy comparing its `tenant_id` to `current_setting('app.tenant_id')`. A reusable function enables the policy for a given schema and table and is called from hand-written migrations.

## Data model

Columns, types, keys and foreign keys are modeled in `drizzle/DIAGRAM.md`; this doc holds only which tables belong to which schema and the rules that cut across them.

- Ids are UUID v7 generated in the application layer, never by a Postgres default, so the id is known before the insert and ordering follows creation time.
- Money is stored as integer minor units (`bigint`) in a single fixed currency; stock is an `integer` with a check against negative values.

## Persistence invariants

- Every tenant-scoped row carries `tenant_id` and is covered by a row-level policy.
- Foreign keys across schemas exist only toward `platform.tenants` and from `sales.items` to `catalog.products`. Wallet, messaging and audit refer to their origin by type and id with no foreign key, keeping them decoupled.
- Stock never goes negative, whichever concurrency strategy is used.
- Wallet entries and audit entries are never updated or deleted.
- An outbox event is committed if and only if the change that produced it committed.
- One idempotency key maps to at most one stored outcome per tenant (unique constraint).
- Uniqueness on soft-deletable tables applies only to live rows (partial unique index on `deleted_at IS NULL`), so a deleted value can be reused.
- Order items keep the name and price seen at purchase time, independent of later product changes.

## Infrastructure

Single PostgreSQL instance in a local container. Bootstrap scripts run in two stages: cluster-level roles first, then per-store creation of the database, schemas, grants and default privileges. Credentials come from an uncommitted environment file. No replication or backup.

## Access patterns

- All writes run inside the Transactor's transaction on the application role.
- Reads that return lists use keyset pagination ordered by `(created_at, id)`; the tiebreaker keeps pages stable. OFFSET is only used in comparison experiments.
- Soft-deleted rows are excluded by default in repositories and queries.
- Schema changes are drizzle-kit migrations plus hand-written SQL for what it does not generate: roles, grants, row-level policies, triggers and partial indexes. Breaking changes follow expand then contract.
- Outbox polling claims rows with `FOR UPDATE SKIP LOCKED`.

---

## Non-goals

- No backup, replication or high availability.
