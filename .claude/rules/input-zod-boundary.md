---
paths:
  - "*/source/app/**"
  - "*/cmd/**"
---

# Input Validation Conventions

This governs how external input enters the application. The project has no network surface; entry points are scripts that simulate requests, and the same rule applies to any future one.

---

## Validate at the boundary

- Every external input is parsed with zod at the entry point, before it reaches a use case, because everything past that line can then rely on typed, valid data.
- Use cases receive the parsed output type, not raw input, so a use case that skips validation does not type-check.
- Domain code enforces domain invariants (state transitions, business rules) but does not re-validate the shape of input, because shape errors and business-rule errors are different failures reported differently.
- Validation failures surface as input errors distinct from domain and database errors.

---

## Non-goals

- Does not cover data read back from the database, which is trusted to match the schema.
