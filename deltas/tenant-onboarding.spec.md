# Tenant Onboarding — Spec

> Identity and tenancy lifecycle: users signing up, tenants being created, who belongs to a tenant with which role, and whether an actor may operate inside a tenant.

## Intent

Every other slice acts inside a tenant on behalf of an actor. This slice is the one that makes those two things exist and decides whether they are allowed to meet: a user signs up, creates a store and becomes its owner, the owners and admins shape the store's membership, and every operation inside a tenant is gated by an admission check that only this slice can answer, because it owns the membership data.

## Scope

Owns:

- Signing up a user.
- Creating a tenant, with its creator as the first owner.
- Managing members: changing a role, removing a member, leaving a tenant.
- Admission: the read model and use case that decide whether an actor may operate inside a tenant. The admission policy and its read-model shape are shared-kernel concepts every bounded context consumes; this slice implements the reads behind them and runs the use case.
- The tables `platform.tenants`, `platform.users`, `platform.memberships`.

Non-goals:

- Invitations and how an invited person joins a tenant (owned by the member-invitation slice; it creates memberships through this slice's rules).
- How audit entries are recorded (owned by the audit-recording slice; this slice only names which actions it audits).
- Real authentication: credentials, passwords, sessions, second factor. The actor arrives already identified.
- Row-level policies on the platform tables (roadmap phase 8, cross-cutting).
- Renaming, suspending or deleting a tenant.

## Contract

### Use cases

| Use case | Transactor context | Input | Effect |
|---|---|---|---|
| Sign up user | `system(origin)`, no actor, no tenant | email, name | Inserts a user with a normalized email. |
| Create tenant | `platform(actorId)` | name | Inserts the tenant and an `owner` membership for the actor in the same transaction. |
| Change role | `tenant(tenantId, actorId)` | target user, new role | Updates the target's active membership role. |
| Remove member | `tenant(tenantId, actorId)` | target user | Soft-deletes the target's active membership. |
| Leave tenant | `tenant(tenantId, actorId)` | none | Soft-deletes the actor's own active membership. |
| Admit actor | `tenant(tenantId, actorId)` | none | Returns the actor's active membership role, or fails with a not-a-member error. |

### Permission matrix

The acting role is the actor's active membership in the tenant.

| Actor role | Change role | Remove member | Leave |
|---|---|---|---|
| owner | Any member to any role, including granting `owner` | Anyone | Yes, unless last owner |
| admin | No | Only memberships with role `member` | Yes |
| member | No | No | Yes |

No role change, removal or departure may leave the tenant without an active owner.

### Email

Emails are normalized in the domain (trimmed and lowercased) by a value object before they are persisted or compared. The database keeps a plain unique constraint on the stored value, which is correct only because every write goes through that normalization.

### Memberships table (target shape)

```
platform.memberships(
  id          uuid primary key,          -- uuid v7, app-generated
  tenant_id   uuid not null -> platform.tenants,
  user_id     uuid not null -> platform.users,
  role        text not null check (role in ('owner','admin','member')),
  created_at  timestamptz not null,
  removed_at  timestamptz null
)
unique (tenant_id, user_id) where removed_at is null
```

A removed membership is kept; a user who returns gets a new row.

### Audited actions

`user.signed_up`, `tenant.created`, `membership.created`, `membership.role_changed`, `membership.removed`, `membership.left`. `tenant.created` runs in a platform context and is written with a null tenant, so it does not appear in the new tenant's own trail. The other membership actions run in the tenant's context.

### Current state

The three tables exist from the platform base migration with a composite primary key `(tenant_id, user_id)` on memberships and no `id` or `removed_at` column. Domain, use cases and repositories for this slice are not implemented. The memberships shape above is the target and needs a migration.

## Invariants

- A tenant always has at least one active owner. Several owners may coexist.
- Every operation that changes a tenant's memberships locks that tenant's row (`SELECT ... FOR UPDATE` on `platform.tenants`) before reading the current owners, so two concurrent changes cannot each see another owner and both remove one.
- A tenant and its creator's owner membership are created in one transaction; neither exists without the other.
- At most one active membership exists per tenant and user.
- Removing or leaving never deletes a membership row; it sets `removed_at`.
- Admission considers only active memberships; a removed member is not admitted.
- No two users share an email after normalization.
- An admin can never act on an owner or another admin, and only an owner can grant `owner`.

## Deferred / Open questions

- How admission reads memberships once row-level security covers the platform tables: admission runs before the tenant is trusted, so it may need a dedicated read path. Decided in roadmap phase 8.
- The name of the core bounded-context folder for this slice (two-word kebab-case per the layering rule). Decided when the domain is implemented.
- Renaming, suspending or deleting a tenant. Not specced until a slice needs it.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced:

- Sign-up stores the email trimmed and lowercased; signing up with a case or whitespace variant of an existing email fails.
- Creating a tenant yields the tenant and exactly one `owner` membership for the creator; a failure after inserting the tenant leaves neither.
- The last owner cannot be demoted, removed or leave.
- Two owners concurrently demoting each other: exactly one succeeds, and the tenant keeps one owner.
- An admin cannot change roles, cannot remove an owner or admin, and can remove a member.
- A member can leave but cannot change roles or remove anyone.
- A removed member fails admission; when the same user rejoins, a new membership row is created and the removed row is kept.
- Admission fails for a user with no membership in the tenant and returns the role for an active member.

---

Last updated: 2026-10-15.
