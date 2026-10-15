---
paths:
  - "*/source/**"
  - "*/drizzle/**"
---

# Transaction Ownership Conventions

This governs how code touches the database for writes: one component owns transactions and per-request database context. It targets the repository, use case and data-access layers; reads that run outside a unit of work are not covered here.

---

## One owner of the transaction

- Every database write runs inside a transaction opened by the Transactor, because it is the only place that also sets the tenant context for the transaction; a write that bypasses it runs without row-level security context and without audit context.
- Repositories and queries never open their own transaction or connection; they resolve the executor bound to the current unit of work, because a second connection would not see uncommitted changes and would break atomicity of audit entries and outbox events.
- The tenant is set with a transaction-scoped setting (`SET LOCAL`), never a session-wide `SET`, because pooled connections would carry one tenant's value into the next request.
- Use cases that need several writes to commit or fail together call the Transactor once and pass the unit of work down, rather than nesting independent transactions.

---

## Non-goals

- Does not decide which isolation level or locking strategy a given operation uses; that is per-operation.
