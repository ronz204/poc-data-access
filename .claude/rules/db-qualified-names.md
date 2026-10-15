---
paths:
  - "*/drizzle/**"
  - "*/source/repos/**"
---

# Schema-Qualified Names Conventions

This governs how database objects are named in table definitions, migrations and queries. The database is split into one Postgres schema per bounded context, and the application role has a fixed search path.

---

## Always qualify

- Declare every table, view and enum through a per-context schema object, never on the default schema, because the default is `public` and objects there escape the per-context grants and policies.
- Hand-written SQL (migrations, policies, queries) names objects with their schema (`catalog.products`), never relying on `search_path`, because resolution through the search path is ambiguous and can silently pick the wrong object or none.
- A new bounded context gets its own schema together with its grants and policies in the same change, because an object created before its grants exist is either unusable or over-exposed.

---

## Non-goals

- Does not cover the names of columns or constraints.
