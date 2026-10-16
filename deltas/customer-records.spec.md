# Customer Records — Spec

> The tenant's record of who buys from it: simple, recoverable after deletion, and referenced by orders.

## Intent

Orders belong to someone. A tenant keeps a small record of its customers so that a sale can name its buyer, and so that removing a customer from day-to-day views never rewrites the history of what that customer bought.

## Scope

Owns:

- Creating, updating, soft deleting, restoring, listing and getting a tenant's customers.
- The table `sales.customers`.

Permissions follow the role matrix of tenant-onboarding, resolved through its admission use case: every active member creates, updates, lists and gets customers; only owner and admin delete and restore, and only owner and admin can include deleted customers in a list.

Non-goals:

- Orders and checkout (the order-checkout slice).
- Addresses, phone numbers, notes, consents.
- Customer accounts or login. A customer is a record, not a user; its email is independent of any user's email.
- Anonymization or erasure of personal data.
- Merging duplicate customers.

## Contract

### Data model (current design)

```
sales.customers(
  id uuid primary key,                       -- uuid v7, app-generated
  tenant_id uuid not null -> platform.tenants,
  name text not null,
  email text not null,
  created_at timestamptz not null,
  deleted_at timestamptz null
)
unique (tenant_id, email) where deleted_at is null
unique (tenant_id, id)                     -- target of the composite foreign key from sales.orders
```

There is no version column and no `updated_at`: concurrent edits are last-write-wins, a deliberate contrast with products.

### Use cases

| Use case | Who | Effect |
|---|---|---|
| Create customer | any active member | Inserts a live customer. |
| Update customer | any active member | Changes name or email of a live customer. |
| Delete customer | owner, admin | Sets `deleted_at`; deleting an already deleted customer fails as not found. (Assumed default.) |
| Restore customer | owner, admin | Clears `deleted_at`; fails with a conflict if a live customer with the same email exists. |
| List customers | any active member; include-deleted only owner, admin | Keyset paginated by `(created_at, id)` with a bounded page size. (Assumed default.) |
| Get customer | any active member for live customers; owner and admin also for deleted ones | Returns the customer. (Assumed default.) |

### Email and name

- Name and email are both required and never empty after trimming.
- The email is normalized with the same value object used for users (trimmed and lowercased) before it is persisted or compared.
- It is unique among the tenant's live customers. The same email may exist as a customer of another tenant, and a deleted customer's email can be reused by a new live customer.

### Deleted customers

Deleting is always allowed, even when the customer has orders; those orders stay intact and visible. A deleted customer is excluded from reads by default, cannot be edited, and cannot be used in a new checkout until restored.

### Audited actions

`customer.created`, `customer.updated`, `customer.deleted`, `customer.restored`. Their metadata is a diff restricted to the allowlisted fields `name` and `email`, through the Recorder of audit-recording.

### Current state

Design only: there is no model, migration or code for customers yet.

## Invariants

- At most one live customer per tenant and normalized email.
- A deleted customer is invisible by default and is never edited or sold to.
- A customer is never physically deleted, because orders reference it.
- Deleting a customer never alters or hides its orders.
- Every customer belongs to exactly one tenant, and a tenant cannot see or modify another tenant's customers (row-level security, added in its roadmap phase).
- Name and email are never empty after trimming.

## Deferred / Open questions

- Erasure or anonymization. A customer's email is personal data and, by the allowlist, also appears in audit metadata; if privacy handling is ever needed, both places have to be covered.
- Extra contact fields.
- Duplicate detection beyond an exact normalized email.
- Optimistic versioning, if concurrent editing of customers ever matters.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced:

- A member can create and update customers but cannot delete or restore them; an owner and an admin can.
- The email is stored trimmed and lowercased, and a case variant of an existing live email fails.
- The same email works in another tenant.
- Deleting a customer frees its email for a new live customer.
- Restoring fails with a conflict when a live customer already has that email.
- A deleted customer is hidden from get and list; include-deleted works only for an owner or admin; editing a deleted customer fails.
- Deleting a customer that has orders leaves those orders readable.
- List pages are stable when `created_at` values are equal, thanks to the `id` tiebreaker.
- An empty or whitespace-only name or email is rejected.
- Audit entries carry only the allowlisted fields.

---

Last updated: 2026-10-16.
