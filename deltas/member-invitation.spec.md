# Member Invitation — Spec

> Bringing a person who may not have a user yet into a tenant with a given role, through a single-use, expiring, secret token that is never stored.

## Intent

A tenant grows by inviting people by email. The invitee may already be a user or may not exist yet, so the invitation is addressed to an email and carries a secret that proves the holder was invited. Accepting it is the only way a membership is created for someone other than a tenant's creator, and it must not become a way to escalate privileges, enroll a different email, or replay an old secret.

## Scope

Owns:

- Inviting an email to a tenant with a role.
- Accepting an invitation by token.
- Revoking a pending invitation.
- Listing a tenant's invitations (owner and admin only).
- The table `platform.invitations`.

Non-goals:

- Delivering the token. There is no email or outbox delivery; the invite use case hands the token back to its caller once.
- Real authentication of the person presenting the token.
- Membership rules (permission matrix, last-owner protection, tenant lock, active-membership uniqueness, soft delete). Those belong to tenant-onboarding; accepting an invitation creates a membership under them.
- Assigning the `owner` role. It is never available through an invitation.
- Resending or rotating a token. Re-inviting means revoking and inviting again.
- Sweeping or deleting old expired rows.

## Contract

### Use cases

| Use case | Transactor context | Input | Effect |
|---|---|---|---|
| Invite | `tenant(tenantId, actorId)` | email, role (`admin` or `member`) | Inserts a pending invitation expiring 7 days after creation and returns the token in clear once. |
| Accept | `system(origin, tenantId)`, no actor | token, name (needed only if no user exists for the invitation's email) | Creates the user if needed, creates an active membership with the invitation's role, marks the invitation accepted with `accepted_at`, all in one transaction. |
| Revoke | `tenant(tenantId, actorId)` | invitation id | Sets a pending invitation to `revoked`. |
| List invitations | `tenant(tenantId, actorId)` | cursor, page size | Returns the tenant's invitations ordered by `(created_at, id)` with a keyset cursor. Owner and admin only. (Assumed default, not discussed.) |

The acceptor never chooses the email: it is always the invitation's. The token lookup by hash happens before the tenant is known, so Accept finds the invitation first and then runs in the invitation's tenant, without an actor.

### Permission matrix

Rules for Invite and Revoke, based on the actor's active membership role.

| Actor role | Invite as admin | Invite as member | Revoke |
|---|---|---|---|
| owner | Yes | Yes | Any invitation of the tenant |
| admin | No | Yes | Only invitations with role `member` |
| member | No | No | No |

### Invite rules

- The email is normalized with the same value object used for users.
- It fails if the email belongs to a user with an active membership in the tenant.
- It fails with a conflict if a pending, non-expired invitation exists for the same tenant and email.
- If a pending invitation exists but has expired (`expires_at` is not in the future), the use case marks it `revoked` and inserts the new one in the same transaction. This is needed because expiry is derived from `expires_at` and the unique index on pending invitations would otherwise block re-inviting.
- A previously removed member can be invited again; acceptance creates a new membership row.

### Accept rules

- Valid only when the invitation is `pending` and not expired.
- If a user exists for the invitation's email, it is used; otherwise a user is created with the given name.
- It takes the tenant row lock like any other membership change.
- If the user already has an active membership in the tenant, it fails and the invitation stays pending. (Assumed default, not discussed.)

### Token

Generated server-side with high entropy and returned in clear only by Invite. Only its hash is stored, and the hash is unique.

### Audited actions

`invitation.created`, `invitation.revoked`, `invitation.accepted`, plus `membership.created` when acceptance creates the membership. Creating the user during acceptance is a platform action outside the tenant and is not audited. Invite and Revoke run in the tenant's context; Accept runs in a system context scoped to the tenant. Entries carry the email and role, never the token or its hash. Accept has no actor, so its entries record the accepting user's id and email in the metadata; otherwise the trail could not say who joined.

### Current state

The table exists from the platform base migration with the columns and indexes above. The domain, the use cases and the repositories are implemented in the `identity-access` context.

The invitation sub-slice holds the aggregate (issued pending, expiring seven days after creation; accepted only while pending and unexpired; revoked only while pending), `InvitationId`, `InvitationRole` (`admin` or `member`, never `owner`), `InvitationStatus`, `TokenHash` (a lowercase sha-256 digest), the invite, revoke and list permission matrix as a policy, and `InvitationError` with the codes `invalid_token_hash`, `already_member`, `invitation_pending`, `invitation_invalid`, `invitation_not_found`, `not_pending` and `name_required`. The permission matrix raises the shared-kernel admission error's `insufficient_role`. The token is minted and hashed through a token vault contract in the invitation sub-slice (mint returns the clear token with its hash, hash derives the hash of a presented token), implemented by an infrastructure adapter that uses 32 random bytes in base64url and a sha-256 hex digest.

Each use case has its own folder:

- Invite member runs in the tenant context. It checks the matrix, refuses an email with an active membership (one membership lookup by email), refuses a pending unexpired invitation, revokes an expired pending one before inserting the new one, and returns the token once. A concurrent duplicate is caught by the partial unique index and surfaces as `invitation_pending`.
- Locate invite finds the tenant of the invitation behind a token hash and runs without a tenant.
- Accept invite runs in a system context scoped to the tenant. It locks the tenant row, re-reads the invitation by hash, requires it pending and unexpired, reuses the user for the email or creates one from the given name (`name_required` otherwise), refuses an active member, inserts the membership and marks the invitation accepted, all in one run.
- Revoke invite and List invites work as the contract describes. The list is for owner and admin, keyset-paginated by `(created_at, id)` with a page size of at most 100 (default 20), an opaque cursor, and a result of `items` plus `nextCursor`.

Locate and accept are two separate runs because the tenant is unknown until the token is found; composing them belongs to the http-endpoints entry. The shared kernel gained a pagination sub-slice (cursor encoding, the page shape, the page size bounds and `invalid_cursor`, mapped to 422).

None of this is exposed over HTTP or audited yet. The use cases are unit-tested with in-memory repositories; the list query and the repositories have no test of their own. The table has no row-level policy yet.

## Invariants

- The token is never stored; only its hash is.
- An invitation is accepted at most once, including under concurrent acceptance.
- At most one pending invitation exists per tenant and email (partial unique index).
- An invitation never grants `owner`; the stored role is `admin` or `member`.
- An expired, revoked, accepted or unknown token can never create a membership or a user.
- The user creation, membership creation and the status change to accepted are atomic.
- A token cannot be used to enroll an email other than the invitation's.
- Only pending invitations can be revoked; an accepted invitation stays accepted.
- Audit entries never contain the token or its hash.

## Deferred / Open questions

- The dedicated read path for finding an invitation by token under row-level security. The lookup runs before the tenant is known, so it needs its own access path when the policies land (the roadmap's row-level security phase).
- Notifying the invitee through an outbox event once a delivery mechanism exists.
- Cleaning up long-expired pending rows.
- Whether the list needs a status filter.

## Acceptance criteria

Integration tests against a real PostgreSQL, using vitest once it is introduced:

- An admin cannot invite as `admin`; a member cannot invite; an admin can invite as `member`.
- Inviting an email with an active membership in the tenant fails.
- A second invitation for the same tenant and email while the first is pending and valid fails with a conflict.
- Inviting over an expired pending invitation revokes the old one and creates a new one.
- The token is returned once, and the database holds only its hash.
- Accepting with an unknown email creates the user, the membership and the accepted status together; if any step fails, none persists.
- Accepting with an email that already has a user reuses that user.
- Accepting with an expired, revoked, already accepted or unknown token fails with no side effects.
- Two concurrent acceptances of the same token produce exactly one membership.
- Accepting when the user already has an active membership fails and the invitation stays pending.
- A removed member can be invited again and accepting creates a new membership row.
- An admin revokes a `member` invitation but not an `admin` one; an owner revokes either.
- No audit entry contains the token or its hash.

---

Last updated: 2026-10-16.
