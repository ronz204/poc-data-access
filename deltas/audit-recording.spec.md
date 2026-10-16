# Audit Recording — Spec

> Application-level recording of who did what, to which entity, when and from where, atomically with the change, plus a tenant-scoped read of that trail.

## Intent

When someone asks "who did this, and when?", the answer has to exist and has to be true. Recording it in the application, inside the same transaction as the change, means the history can never say something the state does not (a rolled-back change leaves no entry, a committed one always has one), and it avoids database triggers, which cannot see the actor or the origin of a change.

## Scope

Owns:

- The Recorder that use cases and repositories call to write an entry inside the current unit of work.
- The shape and naming of entries, and the per-action allowlist that keeps secrets out of them.
- A read query that lists a tenant's entries.
- The table `platform.trailer` and its row-level policies.

Non-goals:

- Deciding which actions each slice audits. Each slice's own spec names its audited actions; this slice defines how any of them is recorded.
- Recording failed or rolled-back operations. The entry rolls back with its transaction; a separate security log is out of scope.
- Recording reads.
- Database triggers.
- Partitioning and retention (stretch goal).
- Any UI.

## Contract

### Entry

```
platform.trailer(
  id          uuid primary key,            -- uuid v7
  tenant_id   uuid null -> platform.tenants,
  actor_id    uuid null,                   -- no foreign key
  origin      text not null,               -- check: ^[a-z0-9_]+(:[a-z0-9_]+)?$
  action      text not null,               -- check: ^[a-z0-9_]+\.[a-z0-9_]+$  (entity.verb)
  entity_type text not null,
  entity_id   uuid null,
  metadata    jsonb not null default '{}',
  xact_id     xid8 not null default pg_current_xact_id(),
  occurred_at timestamptz not null default now()
)
index (tenant_id, occurred_at, id)
```

### Recorder

An explicit call inside the unit of work: action, entity type, entity id, metadata.

- Tenant, actor and origin are never parameters. They come from the transaction context, so a caller cannot forge them.
- Repositories do not audit on their own; the use case decides when a business action is recorded.
- One entry per audited action.
- A failed insert (for example an invalid action name) fails the whole unit of work. (Assumed default, not discussed.)
- Entries written in one transaction share `xact_id`, so they can be grouped. (Assumed default, not discussed.)

### Metadata

- A change records a field-level diff, only for fields in the action's allowlist:

```
{ "changes": { "<field>": { "from": ..., "to": ... } } }
```

- A secret that changed is represented only by the fact that it changed, with no values.
- Actions that do not modify an existing entity (for example creations) carry only allowlisted attributes, such as an email or a role.
- Each action declares its allowed fields. A field that is not declared never reaches the trail, so adding a field to the audit is an explicit change to that declaration.

### Read

A query listing the current tenant's entries:

- Keyset paginated by `(occurred_at, id)` with a bounded page size.
- Optional filters by entity type, entity id and action.
- Only owner and admin may read, decided through the admission use case of tenant-onboarding.
- Served by the read side, not through aggregates.

Entries with a null tenant (platform-level actions such as creating a tenant or signing up a user) are never visible to the application role. This is by design.

### Policies

For the application role, row-level security allows:

- select where the row's tenant equals the transaction's tenant;
- insert only when the row's tenant, actor and origin equal the transaction settings.

There is no update or delete policy. The schema's default grants include update and delete, so append-only rests on the absence of those policies, not on grants.

### Current state

The table, its checks, index and policies exist from the platform base migration. The Recorder, allowlists and read query are not implemented.

## Invariants

- Entries are append-only for the application role.
- An entry exists if and only if the change it describes committed.
- An entry's tenant, actor and origin equal the transaction context; a caller cannot choose them.
- `action` is lowercase `entity.verb`, and `origin` is always present.
- No secret value (token, token hash, password hash) ever appears in `metadata`.
- Reads are scoped to the current tenant.

## Deferred / Open questions

- Comparing application-level recording with database triggers, and diff with snapshot storage (stretch goals).
- Monthly partitioning of the trail. If partitioned, the primary key becomes `(id, occurred_at)`, because Postgres requires the partition key in every unique constraint.
- A separate security log for failed operations.
- A privileged read path for platform-level entries with a null tenant.
- Retention.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced:

- Recording in a tenant context writes the context's tenant, actor and origin, and the Recorder offers no way to override them.
- A rollback removes the entry; a commit keeps it.
- Updating or deleting an entry as the application role is denied.
- An insert whose tenant, actor or origin differs from the transaction settings is rejected by the policy.
- An invalid action name is rejected and fails the unit of work.
- A field outside the action's allowlist never appears in `metadata`.
- A changed secret appears only as a changed marker, with no values.
- Two entries written in one transaction share `xact_id`.
- The list returns only the current tenant's entries in `(occurred_at, id)` order, with stable pages when timestamps are equal.
- A member cannot read the trail; an owner and an admin can.
- An entry with a null tenant is not visible to any tenant's read.

---

Last updated: 2026-10-15.
