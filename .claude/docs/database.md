# Database

The PostgreSQL design for the project: schemas, roles, data model, invariants and access conventions. The schema is the target design; so far only the `platform` tables exist (identity, memberships with soft delete, invitations and the audit trail), created by the first two migrations.

---

## Schema

Postgres schemas are split by bounded context, not by table type, so the namespaces mirror the code modules and the read/write split.

| Schema | Tables | Notes |
|---|---|---|
| `platform` | `tenants`, `users`, `memberships`, `invitations`, `trailer` | Identity and tenancy. `tenants` is the root and carries no row-level policy. `invitations` lets a tenant invite an email address, which may not belong to a user yet. `trailer` is the append-only audit trail; candidate for monthly partitioning. |
| `catalog` | `products`, `categories` | `products` has soft delete, stock and two version counters, one for its data and one for its stock. Owner of stock. |
| `sales` | `customers`, `orders`, `items` | `customers` has soft delete. `items` snapshots product name and price. |
| `wallet` | `accounts`, `entries` | `entries` is an immutable ledger. |
| `messaging` | `events`, `idempotency` | `events` is the outbox, with delivery and retry state (delivered time, attempts, next attempt time, last error, failed time). `idempotency` stores key, request hash and response. |
| `inventory` (planned) | `stock` | Introduced by the stock refactor: one row per product with quantity, stock version and a sellable flag, taking over stock from `catalog.products`. Until then stock lives in the catalog. |
| `reporting` | views, materialized views | Read-only projections for the query side. Exposed as views with a tenant predicate; materialized views are internal storage and are never granted. |

All objects are referenced with their schema. The migration journal lives in its own schema, away from the domain.

## Access control

| Role | Purpose | Used by |
|---|---|---|
| `sampler` | Owns every schema and object; creates and migrates. Holds `CREATE` on the database because the migration tool always issues `CREATE SCHEMA IF NOT EXISTS` for its journal schema, and PostgreSQL checks that privilege before checking whether the schema exists. As the table owner it skips row-level security, so it is never used to read or write application data. | Migration tooling only |
| `runner` | Select, insert and update on platform, catalog, sales and messaging, with delete only on the catalog categories; select and insert on wallet, plus a column-level update on the account balance. Subject to row-level security. | Application writes and transactional reads |
| `reader` | Select on the `reporting` views only: no other schema, no materialized view, no writes. Subject to row-level security. | Application read side (reports) |
| `relayer` | Reads outbox events and updates only their delivery columns, through a column-level grant; nothing else in messaging. Created with `BYPASSRLS` because it claims events across all tenants. | Outbox worker |

The split prevents the application from altering schema, rewriting history (audit, ledger) or escaping tenant isolation. Privileges are granted as default privileges of `sampler` per schema, so every table a migration creates is covered automatically. The defaults give `runner` select, insert and update and never delete; a table that needs more (hard delete on the catalog categories, the balance update on `wallet.accounts`) or less (outbox events) gets an explicit grant or revoke in its own migration. Tables that must not change once written are also covered only by select and insert policies, so even where an update privilege exists no row can be updated or deleted. Functions are not executable by `PUBLIC` by default, so a function used by policies needs an explicit execute grant. A table owner skips row-level security, and tables deliberately do not use `FORCE ROW LEVEL SECURITY`: the only role that owns objects is the migration role, which never operates on application data, so forcing would add nothing. The guarantee rests on the application connecting only as `runner` or `reader`, the roles the policies filter, so the isolation tests must connect as them. Reporting objects cannot rely on policies, because a view runs with its owner's rights and a materialized view has no policies, so each exposed view carries its own tenant predicate.

Tenant isolation: every transaction sets `app.tenant`, `app.actor` and `app.origin` locally, and each tenant-scoped table has a policy comparing its `tenant_id` to `current_setting('app.tenant')` (an empty setting reads as `NULL`, so it never matches). Policies are declared next to the table definition and generated into migrations with it.

The audit trail lives in `platform`, whose default grants include update, so its append-only guarantee comes from its policies rather than from grants: `runner` has a select policy (rows of the current tenant) and an insert policy (tenant, actor and origin must equal the transaction settings), and no update or delete policy.

## Data model

Columns, types, keys and foreign keys are modeled in `drizzle/DIAGRAM.md`; this doc holds only which tables belong to which schema and the rules that cut across them.

- Ids are UUID v7 generated in the application layer, never by a Postgres default, so the id is known before the insert and ordering follows creation time.
- Money is stored as integer minor units (`bigint`) in a single fixed currency; stock is an `integer` with a check against negative values.

## Persistence invariants

- Every tenant-scoped row carries `tenant_id` and is covered by a row-level policy.
- Foreign keys across schemas exist only toward `platform.tenants`, from `sales.items` to `catalog.products`, and, once stock moves out of the catalog, from `inventory.stock` to `catalog.products`. Wallet, messaging and audit refer to their origin by type and id with no foreign key, keeping them decoupled.
- Stock never goes negative, whichever concurrency strategy is used.
- Wallet entries, audit entries, orders and order items are never updated or deleted: wallet entries through their schema's grants, the others through row-level policies that allow select and insert only.
- An outbox event is committed if and only if the change that produced it committed.
- An event is claimed only while it is undelivered, not failed and due; a delivered or failed event is never claimed again.
- One idempotency key maps to at most one stored outcome per tenant (unique constraint).
- Uniqueness on soft-deletable tables applies only to live rows (partial unique index on `deleted_at IS NULL`), so a deleted value can be reused.
- Order items keep the name and price seen at purchase time, independent of later product changes.
- Every reporting object the application reads is a view with a tenant predicate and the security-barrier option; materialized views are never granted to an application role.
- A tenant has at most one pending invitation per email (partial unique index on `status = 'pending'`), and an invitation never grants the owner role.
- Invitation tokens are stored only as a hash, so a database read cannot be replayed to accept an invitation.

## Infrastructure

Single PostgreSQL instance in a local container with a single database; tests run against it too. Bootstrap scripts run once, idempotently, in two stages: cluster-level roles first (created or re-synced with their passwords), then the store: connection and creation rights, schemas, schema usage with default table privileges, and revocation of permissive defaults. The migration journal lives in the `drizzle` schema. Credentials come from an uncommitted secrets file kept beside the bootstrap scripts. No replication or backup.

## Access patterns

- All writes run inside the Transactor's transaction on the application role.
- Reads that return lists use keyset pagination ordered by `(created_at, id)`; the tiebreaker keeps pages stable. OFFSET is only used in comparison experiments.
- Soft-deleted rows are excluded by default in repositories and queries.
- Schema changes are drizzle-kit migrations plus hand-written SQL for what it does not generate: roles, grants, row-level policies, triggers and partial indexes. Breaking changes follow expand then contract.
- Outbox polling claims due rows with `FOR UPDATE SKIP LOCKED` on the relayer role, inside the transaction that also marks them delivered, so a crashed worker releases its claim.

---

## Non-goals

- No backup, replication or high availability.
