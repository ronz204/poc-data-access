# Stock Inventory — Spec

> Stock moved out of the product definition into its own schema, so selling and restocking contend on their own row and rules, and a live expand then contract migration proves the schema can change while checkout keeps working.

## Intent

Stock changes on every sale, while a product's name, price and category change rarely. Keeping both on one row makes unrelated work contend: a sale locks the product an administrator is editing, and the two share a version counter. Giving stock its own table gives it its own row, lock, counter and rules. The move is also the project's exercise in changing a live schema safely: every step ships on its own, stays reversible for as long as it can, and leaves the whole test suite passing, with no downtime.

## Scope

This slice is a refactor, specified here as the target contract before anything is implemented. Until its last migration step lands, stock lives in the catalog exactly as the product-catalog slice says; after it lands, this slice supersedes the stock parts of the other slices (see the section on what changes elsewhere).

Owns:

- The schema `inventory` and the table `inventory.stock`.
- The operations: Adjust stock, Reserve stock (internal, called by checkout inside its unit of work) and Get stock.
- The migration plan from stock-in-products to inventory: expand, transition and contract, with its verification.

Permissions follow the role matrix of tenant-onboarding, resolved through its admission use case.

Non-goals:

- A movement ledger, the history of stock movements. It is deliberately deferred.
- Multiple warehouses or locations.
- Reservations or holds with an expiry, and backorders.
- Reorder alerts or events.
- Units of measure.
- Stock for anything that is not a product.

## Contract

### Data model (target)

```
inventory.stock(
  tenant_id     uuid not null,
  product_id    uuid not null,
  quantity      integer not null check (quantity >= 0),
  stock_version integer not null,
  sellable      boolean not null,
  updated_at    timestamptz not null,
  primary key (tenant_id, product_id),
  foreign key (tenant_id, product_id) -> catalog.products (tenant_id, id)
)
```

- One row per product, created with the product and never deleted, because products are never physically deleted.
- The composite foreign key keeps the row inside its product's tenant and prevents a row without a product. It is the third foreign key across schemas, after those toward `platform.tenants` and from `sales.items` to `catalog.products`.
- `sellable` mirrors "the product is not deleted". It exists so that reserving stock never has to read the product.

### Ownership

Inventory owns adjusting, reserving and reading stock; the product-catalog slice stops having stock. Two operations of the catalog touch the stock row, in the same transaction, orchestrated in the application layer because the core contexts do not import each other:

- Create product accepts an optional initial quantity (default 0) and creates the stock row with it.
- Delete product sets `sellable` to false, and Restore sets it to true.

Product reads that need the quantity (get and list) obtain it on the read side by joining inventory.

### Operations

| Operation | Who | Effect |
|---|---|---|
| Adjust stock | owner, admin | Applies a signed delta atomically: `quantity = quantity + delta WHERE quantity + delta >= 0`. Carries no expected version. Fails with an insufficient-stock error when the result would be negative. Increments `stock_version` and sets `updated_at`. A non-sellable (deleted) product's stock cannot be adjusted until the product is restored. (Assumed default.) |
| Reserve stock | internal, from checkout | Same contract as today's reservation (below), now acting on the stock row only. |
| Get stock | any active member | Returns the quantity of a product, like product reads. |

### Reserve stock

The contract is that of order-checkout, unchanged for its callers:

- All-or-nothing across the request's lines, with lines processed ordered by product id.
- Three interchangeable strategies: a row lock on the stock row, the conditional atomic update (the default), and an optimistic check on `stock_version` with bounded retry.
- The statement requires `sellable` and `quantity >= q` together. Because delete and restore write the same row's `sellable`, a product deleted at the same moment cannot be sold: a join to the product inside the update would not re-check the joined row under `READ COMMITTED`, so the flag lives on the row being updated.
- Every successful reservation increments `stock_version`.
- A missing stock row is a not-found error naming the product.

### Privileges

(Assumed.) The `inventory` schema gets `USAGE` for `runner` and default privileges of select, insert and update, with no delete. `reader` has no access; reports reach stock only through reporting views. The tenant row-level policy is added in the row-level security phase.

### Audited actions

After the contract step, `stock.adjusted` replaces `product.stock_adjusted`, with the allowlisted metadata quantity before, quantity after and delta. Reservations are not audited separately; they belong to `order.placed`. (Assumed default.)

### Migration plan

Each step can be deployed on its own, leaves the full test suite passing, and needs no downtime.

1. **Expand.** Create the schema and `inventory.stock` with constraints, privileges and the foreign key. Nothing reads or writes it yet.
2. **Start dual-write.** Products remain the source of truth. The application mirrors every stock change (product creation, adjustment, reservation, delete and restore) into `inventory.stock` in the same transaction, as an upsert. The mirror copies the resulting values, so both sides are equal after each transaction.
3. **Backfill.** Copy the existing rows in batches, idempotently, while live writes continue. `quantity` comes from the product's stock, `stock_version` from its stock version, and `sellable` is true when the product is not deleted.
4. **Verify.** A consistency check compares counts and per-product values between the two sides, also per tenant. It must report zero differences before continuing, and it can be rerun at any time.
5. **Switch authority.** Reads and the reserve and adjust statements move to `inventory.stock`, which becomes the source of truth. The old columns are still mirrored from inventory, so the switch can be reverted by flipping reads back.
6. **Contract.** Stop writing the old columns, drop the product's stock, its stock version and their check constraint, and remove the mirror code.

Steps 1 to 5 are reversible: turn the dual-write off or flip the reads back. Step 6 is not, except by a forward fix.

### What changes in other slices when this lands

- **product-catalog:** loses the stock and stock-version columns and the Adjust stock use case. Create product gains the initial quantity. Delete and Restore also flip `sellable`. The audit action moves to `stock.adjusted`.
- **order-checkout:** the reservation port acts on `inventory.stock`, with the same strategies and contract, and the product-live check becomes the `sellable` flag.
- **sales-reporting:** report 3 reads the quantity from inventory.
- **Persistence reference:** the schema list, the rule on foreign keys across schemas and the privileges.

### Current state

Design only. The slice depends on product-catalog and order-checkout being implemented, and it is built in the refactor phase, after the read models. Until the contract step lands, the product-catalog slice is the source of truth for stock.

## Invariants

- `quantity` is never negative.
- There is exactly one stock row per product, created in the same transaction as the product.
- A non-sellable stock row can never be reserved or adjusted.
- `stock_version` increments on every quantity change.
- `sellable` always equals "the product is not deleted", and changes in the same transaction as the product's delete or restore.
- During steps 2 to 5, both copies hold the same values after every committed transaction, as the consistency check verifies, until step 6.
- A stock row and its product always belong to the same tenant.
- Reservation stays all-or-nothing and deadlock-free after the move.
- Stock changes never contend with edits of a product's data: they touch different rows and different version counters.
- No migration step needs downtime or a maintenance window, and each leaves the full test suite passing.

## Deferred / Open questions

- A movement ledger (history, reasons, reversals, like the wallet) if stock traceability matters.
- Multiple locations.
- Holds with an expiry.
- Reorder events through the outbox.
- Whether `stock_version` is still needed once the default strategy does not use it; the optimistic strategy does.
- Automatic periodic reconciliation after the contract step.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced:

- The expand step creates the table without affecting the existing tests.
- With dual-write on, concurrent checkouts and adjustments leave both copies equal: the consistency check reports zero differences.
- The backfill under concurrent writes ends with zero differences, and the consistency check detects an injected difference.
- Creating a product creates its stock row (0 or the given quantity) atomically; a failure leaves neither.
- Deleting a product makes the stock row non-sellable and a reservation then fails; restoring makes it sellable again.
- Adjust stock works with positive and negative deltas, rejects a result below zero, and concurrent adjustments serialize correctly.
- The three reservation strategies pass the same concurrency tests as before against inventory: no oversell, no deadlock with lines in opposite orders, and a product deleted mid-checkout is not sold.
- Editing a product's name or price while sales hit its stock never produces a conflict.
- Switching authority and flipping it back loses no data.
- The contract step drops the old columns and the whole prior suite still passes.
- A stock row cannot reference a product of another tenant.
- `runner` cannot delete stock rows, and `reader` cannot read inventory.

---

Last updated: 2026-10-15.
