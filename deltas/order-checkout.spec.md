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
  customer_id uuid not null -> sales.customers,
  status text not null check (status in ('placed')),
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null
)

sales.items(
  tenant_id uuid, order_id uuid, product_id uuid -> catalog.products,
  name_snapshot text not null,
  price_snapshot_cents bigint not null,
  qty integer not null check (qty > 0),
  primary key (tenant_id, order_id, product_id)
)
```

### Checkout request

```
Idempotency-Key: <key>            required; semantics in the idempotency-keys slice
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
- Orders and items are immutable: no update or delete path exists. (Assumed default.)

### Stock reservation

One port, "reserve stock", with three interchangeable implementations selected by configuration:

| Strategy | Mechanism |
|---|---|
| Row lock | Select the product `FOR UPDATE`, check, then update. |
| Conditional atomic update | `stock = stock - qty WHERE stock >= qty`, then check the affected rows. This is the default. |
| Optimistic version | Update `WHERE version = expected`; on conflict retry up to a bound, then fail with a contention error. (Assumed default bound: 3.) |

The contract is identical for all three:

- All-or-nothing across the request's lines.
- Every successful decrement increments the product's version and sets `updated_at`, as the product-catalog slice defines.
- Lines are processed ordered by product id, so concurrent checkouts take locks in the same order and cannot deadlock each other.
- Correctness does not depend on a serializable isolation level; the default `READ COMMITTED` is enough.

### Orchestration

Everything below runs in one transaction under the Transactor, in a tenant context:

1. Resolve the idempotency key.
2. Validate the customer and the products.
3. Reserve stock, lines ordered by product id.
4. Insert the order and its items.
5. Record the `OrderPlaced` event in the outbox.
6. Credit the tenant's wallet by the order total; the ledger entry refers to the order by type `order` and the order's id, with no foreign key.
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

## Invariants

- Stock is never negative, under any concurrency level and with any of the three strategies.
- A checkout is all-or-nothing: it either places the order, decrements all stock, records the event, credits the wallet, writes the audit entry and stores the idempotency outcome, or it does none of them.
- An order has at least one item, and each product appears at most once in it.
- Items keep the name and price seen at purchase, independent of later catalog changes.
- The order total equals the sum of its items, and the wallet credit equals the order total, exactly once per order.
- Replaying a request with the same idempotency key never decrements stock, creates an order, credits the wallet or emits an event a second time.
- A deleted product or customer cannot be part of a new order.
- Orders and items are immutable once placed.
- A tenant cannot read or place orders in another tenant (row-level security, roadmap phase 8).

## Deferred / Open questions

- Which strategy stays the default after the measurements. It starts as the conditional atomic update.
- The mechanism that guarantees an item's product and order belong to the same tenant (for example composite foreign keys). Decided at implementation.
- Cancelling and refunding orders.
- Detecting price changes by letting the client send the expected price.
- Larger limits on the number of lines.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced. Concurrency tests run once per strategy.

- A single checkout creates the order and items, decrements stock, bumps the products' versions, and records the event, the credit and the audit entry.
- 100 concurrent checkouts for a product with stock `S` (via `Promise.all`) sell exactly `S` units, leave stock at 0, make the surplus fail cleanly and never produce negative stock.
- Concurrent multi-line checkouts listing the same products in opposite orders do not deadlock.
- Insufficient stock on one of several lines rolls back the other decrements and every other effect, and reports all lacking lines.
- A request with an unknown or deleted product, a deleted customer, a duplicate product line, `qty <= 0`, an empty lines list or too many lines is rejected with no side effects.
- Items keep their snapshot after the product's price or name changes.
- Forcing a failure at any step, including after the wallet credit, leaves no order, stock change, event, credit, audit entry or idempotency record.
- Replaying the request with the same key returns the stored response with no second effect (the details are covered in the idempotency-keys slice).
- The order total equals the sum of its items, and the wallet credit equals the total.
- Any active member can check out and read orders; another tenant cannot read them.
- List pages are stable when `created_at` values are equal.
- The application role cannot update or delete orders or items.

---

Last updated: 2026-10-15.
