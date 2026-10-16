# Order Checkout — Spec

> Turning a customer's request to buy products into a placed order atomically: stock reserved, sale recorded, event announced, wallet credited, audit written, and the whole thing safe to retry and to run concurrently.

## Intent

Checkout is where the project's patterns meet. A sale touches stock, orders, the outbox, the wallet, the audit trail and the idempotency record, and the store must never end up with a half-done sale: stock gone but no order, an order but no credit, an event for something that rolled back. It must also hold when many shoppers buy the last units at once and when the same request arrives twice.

## Scope

Owns:

- The Checkout use case (place an order), plus Get order and List orders.
- The tables `sales.orders` and `sales.items`.
- The orchestration of one checkout across the catalog, idempotency, outbox, wallet and audit slices inside a single unit of work.
- The stock reservation contract that the three concurrency strategies must satisfy.

Permissions follow the role matrix of tenant-onboarding, resolved through its admission use case: any active member can check out and can read and list the tenant's orders.

Non-goals:

- Payment processing, taxes, discounts, shipping.
- Backorders or partial fulfillment.
- Cancelling, refunding or returning an order, and any status beyond `placed`.
- Editing an order after it is placed.
- Reports (sales-reporting slice).
- The mechanics of idempotency, outbox delivery and the ledger. Each is specified in its own slice (idempotency-keys, outbox-delivery, wallet-ledger); this slice only fixes when they run and that they commit or fail together.
- Stock replenishment and the stock rules themselves (product-catalog).

## Contract

### Data model (current design)

```
sales.orders(
  id uuid primary key, tenant_id uuid not null -> platform.tenants,
  customer_id uuid not null,
  status text not null check (status in ('placed')),
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null
)
unique (tenant_id, id)                 -- target of the composite foreign key from items
foreign key (tenant_id, customer_id) -> sales.customers (tenant_id, id)

sales.items(
  tenant_id uuid, order_id uuid, product_id uuid,
  name_snapshot text not null,
  price_snapshot_cents bigint not null,
  qty integer not null check (qty > 0),
  primary key (tenant_id, order_id, product_id)
)
foreign key (tenant_id, order_id)   -> sales.orders (tenant_id, id)
foreign key (tenant_id, product_id) -> catalog.products (tenant_id, id)
```

The composite foreign keys make a cross-tenant reference impossible in the database: an order can only name a customer of its own tenant, and an item can only belong to an order and a product of its own tenant. They require `unique (tenant_id, id)` on `sales.customers` and `catalog.products`, as their own slices state.

### Checkout request

```
idempotencyKey                    required; semantics in the idempotency-keys slice
                                  (carried by the Idempotency-Key header once the HTTP surface exists)
customerId, lines: [{ productId, qty }]
```

- The client never sends a price or a name. Both are read from the catalog inside the transaction and copied into the item.
- `qty` is an integer greater than zero and bounded above. (Assumed default: bounded so that it fits the stock column.)
- The number of lines is bounded. (Assumed default: 50.)
- The request is validated at the entry of the use case, before any database work.
- The whole request is rejected, with no side effects, when:
  - the lines list is empty or too long;
  - a product appears in more than one line;
  - a product is unknown, deleted or from another tenant;
  - the customer is unknown, deleted or from another tenant.

### Order

- The status is `placed`; the check constraint admits no other value for now.
- `total_cents` is the sum of `price_snapshot_cents * qty` over the order's items, computed inside the transaction from the snapshots and never taken from the client. (Assumed default.)
- Orders and items are immutable: their row-level policies allow select and insert only, and the application role has no delete privilege on them.

### Stock reservation

One port, "reserve stock", with three interchangeable implementations selected by configuration:

| Strategy | Mechanism |
|---|---|
| Row lock | Select the product `FOR UPDATE`, check, then update. |
| Conditional atomic update | `stock = stock - qty WHERE stock >= qty`, then check the affected rows. This is the default. |
| Optimistic version | Update `WHERE stock_version = expected`; on conflict retry up to a bound, then fail with a contention error. (Assumed default bound: 3.) |

The contract is identical for all three:

- All-or-nothing across the request's lines.
- Every successful decrement increments the product's `stock_version`, not its data `version`, and sets `updated_at`, as the product-catalog slice defines.
- Lines are processed ordered by product id, so concurrent checkouts take locks in the same order and cannot deadlock each other.
- The reservation statement itself requires the product to be live (not deleted), in all three strategies, so a product deleted after the validation step cannot be sold.
- Correctness does not depend on a serializable isolation level; the default `READ COMMITTED` is enough.

### Orchestration

Everything below runs in one transaction under the Transactor, in a tenant context. Before step 1 the actor is admitted through the admission use case of tenant-onboarding, so an idempotency key is only ever resolved for an actor allowed to check out.

1. Resolve the idempotency key.
2. Validate the customer and the products. The customer row is read with a share lock, so a concurrent delete cannot commit between this check and the order insert.
3. Reserve stock, lines ordered by product id.
4. Insert the order and its items.
5. Record the `OrderPlaced` event in the outbox.
6. Credit the tenant's wallet by the order total when it is greater than zero; the ledger entry refers to the order by type `order` and the order's id, with no foreign key. A zero-total order writes no entry, because ledger entries are nonzero.
7. Record the audit entry `order.placed`.
8. Store the response against the idempotency key.
9. Commit.

A failure at any step rolls back every previous step: stock, order, items, event, credit, audit entry and idempotency record.

### Failures

(Assumed defaults.)

| Situation | Result |
|---|---|
| Insufficient stock | Reports every line lacking stock, with its product id and the available quantity; nothing changes. |
| Unknown or deleted product or customer | Not-found style error naming the id. |
| Contention beyond the retry bound (optimistic strategy only) | A retryable contention error. |
| Invalid input | An input error. |

### Event and audit

- `OrderPlaced` payload: order id, customer id, total, and the lines (product id, quantity, price snapshot). (Assumed default.)
- Audit action `order.placed`, with the allowlisted metadata `customer_id`, `total_cents` and the number of lines. Item names and prices are not audited.

### Reads

- Get order returns the order with its items.
- List orders is keyset paginated by `(created_at, id)` with a bounded page size and an optional customer filter.
- Both are scoped to the tenant.

### Current state

Design only: there is no model, migration or code for orders and items. The Transactor exists. Checkout depends on the catalog, idempotency, outbox, wallet and audit slices being implemented.

## Context

Every checkout of a tenant credits the same wallet account row, so concurrent checkouts of different products still queue on that row until each one commits, while the stock strategies only contend per product. When comparing the three strategies, measure with and without the credit step; otherwise the account row hides the difference. Moving the credit out of the transaction, for example to a consumer of `OrderPlaced`, would remove that hot row at the cost of the all-or-nothing guarantee, and the unique origin on the ledger would still keep it to one credit per order. That alternative is a stretch goal, not part of this contract.

Locks are always taken in the same order: product rows by id, then the wallet account row. A wallet movement only takes the account row, so checkouts and movements cannot deadlock each other.

## Invariants

- Stock is never negative, under any concurrency level and with any of the three strategies.
- A checkout is all-or-nothing: it either places the order, decrements all stock, records the event, credits the wallet, writes the audit entry and stores the idempotency outcome, or it does none of them.
- An order has at least one item, and each product appears at most once in it.
- Items keep the name and price seen at purchase, independent of later catalog changes.
- The order total equals the sum of its items. When the total is positive, exactly one wallet entry credits it; a zero total writes none.
- Replaying a request with the same idempotency key never decrements stock, creates an order, credits the wallet or emits an event a second time.
- A deleted product or customer cannot be part of a new order.
- Orders and items are immutable once placed.
- An order's customer, and an item's order and product, always belong to the same tenant as the row itself, enforced by composite foreign keys.
- A tenant cannot read or place orders in another tenant (row-level security, roadmap phase 8).

## Deferred / Open questions

- Which strategy stays the default after the measurements. It starts as the conditional atomic update.
- Cancelling and refunding orders.
- Detecting price changes by letting the client send the expected price.
- Larger limits on the number of lines.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced. Concurrency tests run once per strategy.

- A single checkout creates the order and items, decrements stock, bumps the products' stock versions, and records the event, the credit and the audit entry.
- 100 concurrent checkouts for a product with stock `S` (via `Promise.all`) sell exactly `S` units, leave stock at 0, make the surplus fail cleanly and never produce negative stock.
- Concurrent multi-line checkouts listing the same products in opposite orders do not deadlock.
- Insufficient stock on one of several lines rolls back the other decrements and every other effect, and reports all lacking lines.
- A request with an unknown or deleted product, a deleted customer, a duplicate product line, `qty <= 0`, an empty lines list or too many lines is rejected with no side effects.
- Items keep their snapshot after the product's price or name changes.
- Forcing a failure at any step, including after the wallet credit, leaves no order, stock change, event, credit, audit entry or idempotency record.
- Replaying the request with the same key returns the stored response with no second effect (the details are covered in the idempotency-keys slice).
- The order total equals the sum of its items, and the wallet credit equals the total; an order with a zero total creates no wallet entry.
- A product deleted between the validation and the reservation is not sold, with each strategy; a customer deleted at the same moment either blocks the checkout until it commits or makes it fail, never producing an order for a deleted customer.
- Any active member can check out and read orders; another tenant cannot read them.
- List pages are stable when `created_at` values are equal.
- The application role cannot update or delete orders or items.
- An order cannot reference a customer of another tenant, and an item cannot reference an order or a product of another tenant, even through raw SQL.

---

Last updated: 2026-10-15.
