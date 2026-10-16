# Sales Reporting — Spec

> Read models for understanding a tenant's sales and stock: joins, aggregates and rankings computed in SQL, strictly tenant-scoped and honest about how fresh the numbers are.

## Intent

A tenant wants to know what sells, who buys the most and what is running out. Answering that by loading orders and customers into the application would be slow and would defeat the read side of CQRS lite. The reports are computed in the database over the data the write side already keeps, on a role that can only read them, and they stay fast on about a million seeded rows. What a report shows is always committed data, and when a report is allowed to lag it says by how much.

## Scope

Owns:

- Three reports: sales per product and month, top customers by revenue, and low stock with sales rotation.
- The objects of the `reporting` schema: views and one materialized view.
- The read queries over them, and the supporting indexes.
- The `reader` role the read side connects with.

Permissions follow the role matrix of tenant-onboarding, resolved through its admission use case: only owner and admin read reports. (Assumed default: reports show revenue and customer data.) Reads are not audited.

Non-goals:

- Reading a single order with its items and customer, which Get order and List orders already do in order-checkout.
- Wallet statements (wallet-ledger).
- Exports, charts and any UI.
- Real-time streaming, ad hoc queries, forecasting, tax or cost reports.
- Writing anything.

## Contract

### Tenant isolation

Row-level security cannot protect reporting. A view is evaluated with its owner's privileges, and the owner is the migration role, which skips row-level security; a materialized view cannot have row-level security at all. So the isolation is part of every definition:

- Every object the application reads is a regular view created with `security_barrier` and a mandatory tenant predicate in its definition: the row's tenant equals the `app.tenant` setting. An empty setting reads as `NULL`, which matches no rows, so a report without a tenant context returns nothing.
- Materialized views are internal storage. They are never granted to any application role and are read only through those views.

### Reader role

A new application role, `reader`: `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, with `USAGE` on the `reporting` schema and `SELECT` on its views, and no privilege on any other schema, on any materialized view, or for writing. The read side connects as `reader`. Every reporting read runs in a read-only transaction with the tenant set transaction-locally, with the same settings as writes. `runner` no longer reads `reporting`. A connection setting for `reader` is added with the role.

### Report 1: sales per product and month

For each product and calendar month (UTC, from the order's `created_at`):

- units sold (sum of `qty`),
- revenue in minor units (sum of `price_snapshot_cents * qty`),
- number of distinct orders.

The display name is the product's most recent `name_snapshot`. (Assumed default.) Products deleted later still appear, because this is history.

Parameters: a range of months, bounded to 24 months (assumed default), and an optional product filter. The list is keyset paginated by `(month, product id)` with a bounded page size.

It is backed by one materialized view whose grain is tenant, product and month, with a unique index on that grain so it can be refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Each row carries the time of the refresh that produced it, and every response includes `as_of`, the latest refresh time among the rows read; it is absent when the tenant has no rows yet. (Assumed mechanism.)

### Report 2: top customers by revenue

For each customer: revenue (sum of the orders' `total_cents`), number of orders and date of the last order, ranked by revenue descending with the rank computed by a window function. Ties are broken by customer id. Deleted customers are included and marked as deleted.

Parameters: an optional date range and a limit N, default 10 and at most 100 (assumed defaults). The result is a bounded top-N list with no cursor. (Assumed default.) It is a live view over current data.

### Report 3: low stock and rotation

Live products (not deleted) whose stock is at or below a threshold, with the units sold in a recent window computed from the items.

Parameters: the threshold, default 10, and the window in days, default 30 and at most 365 (assumed defaults). Ordered by stock ascending and then product id, keyset paginated by `(stock, product id)` with a bounded page size. It is a live view.

### Refresh

(Assumed defaults.)

- The refresh runs through a function owned by the migration role with security-definer rights, so the migration role never operates on application data directly and the role that triggers it needs only `EXECUTE` on that function.
- It can be triggered on demand by an owner or admin, or by a system job at an interval.
- The materialized view is global, so a refresh recomputes every tenant's rows. On-demand refresh is therefore throttled: if the last refresh is more recent than a minimum interval (default 60 seconds), the request returns the current `as_of` without refreshing.
- A failed refresh keeps the previous contents, because a concurrent refresh is atomic.

### Freshness

Reports 2 and 3 are live and reflect committed data. Report 1 can lag by up to the refresh interval, and says so through `as_of`. Each report is one statement and reads one snapshot.

### Money

Revenue always comes from the item snapshots or the order totals, never from the current catalog price. Units come from the items' quantities. All sums are integer minor units, with no rounding.

### Performance

The seeded dataset has about a million orders, generated with the seeding tool. The slice measures, with `EXPLAIN (ANALYZE)`: the live aggregate against the materialized one for report 1, and keyset against offset pagination. The supporting indexes belong to the slice: items by tenant, product and creation, orders by tenant, customer and creation, and products by tenant and stock. No latency budget is promised yet.

### Current state

There are no views, migration or code yet. The `reader` role already exists in the bootstrap, with `USAGE` on `reporting`, a default `SELECT` on its tables and its connection setting in the environment sample; `runner` no longer reads `reporting`. The slice depends on orders, items, customers and products existing.

## Invariants

- Every object the application reads in `reporting` is a view with a tenant predicate and `security_barrier`.
- A materialized view is never granted to an application role.
- A tenant never sees another tenant's rows, even with raw SQL as `reader`.
- `reader` has no write privilege and no access outside `reporting`.
- Reports reflect only committed data.
- `as_of` of report 1 is never later than the actual last refresh.
- Revenue and units equal the sums of the underlying items and orders: summing report 1 over all products and months in a range equals the sum of the orders' totals in that range.
- Every result is bounded, by a page size or a top-N limit.
- Deleted products and customers keep appearing in historical reports.
- The reports never modify data.

## Deferred / Open questions

- Latency targets.
- Refresh strategy at scale: incremental or partitioned aggregates, or per-tenant materialization.
- Time zones other than UTC.
- More reports: cohorts, retention, per-category sales.
- Caching in front of the reports.
- Whether on-demand refresh by tenants is acceptable in a real multi-tenant system, since it recomputes everyone's data.
- A refresh log.

## Acceptance criteria

Integration tests against a real PostgreSQL with the seeded dataset, using vitest once it is introduced:

- `reader` can select from the reporting views and from nothing else: no table in another schema, no materialized view, no write.
- Each view returns only the current tenant's rows, and none when no tenant is set; raw SQL as `reader` cannot reach another tenant through any exposed object.
- Report 1 equals the sums computed directly from the items, and its total over a range equals the sum of the orders' totals.
- `as_of` reflects the last refresh, and a refresh makes new orders appear.
- A second on-demand refresh within the minimum interval does not refresh.
- A failed refresh leaves the previous data in place.
- A deleted product and a deleted customer still appear in the historical reports.
- Report 2 ranks by revenue with a stable tie-break and respects N and the date range.
- Report 3 lists only live products at or below the threshold, with the right recent units.
- Pages are stable when sort keys are equal; page size and limits are enforced.
- A member is rejected; an owner and an admin can read.
- The query-plan comparison is recorded for the seeded dataset: materialized against live, and keyset against offset.

---

Last updated: 2026-10-15.
