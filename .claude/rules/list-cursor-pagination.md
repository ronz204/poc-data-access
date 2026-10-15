---
paths:
  - "*/source/repos/**"
  - "*/source/app/**"
---

# List Pagination Conventions

This governs every query or use case that returns a collection of rows. Single-row lookups and aggregates that return one row are out of scope.

---

## Bounded, keyset-paginated lists

- Every collection query is bounded by a page size with an enforced maximum, because an unbounded fetch grows with the data and eventually exhausts memory or time.
- Pages use keyset (cursor) pagination ordered by `(created_at, id)`, never `OFFSET`, because offset cost grows with page depth and rows inserted between requests shift the window.
- `id` is always the tiebreaker, because timestamps are not unique and a non-unique sort key makes pages skip or repeat rows.
- The cursor is opaque to callers and encodes the last row's sort key; the response says whether another page exists.
- A deliberate `OFFSET` appears only in comparison experiments, and says so where it is used.

---

## Non-goals

- Does not apply to internal batch processing, such as the outbox worker claiming events, which has its own claiming protocol.
