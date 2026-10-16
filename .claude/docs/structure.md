# Structure

Stack, runtime topology and cross-cutting patterns. The data model and database roles live in the persistence reference, not here.

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime and package manager | Bun | Fast TypeScript execution and test runner without a build step. |
| Language | TypeScript, strict | Strict flags including unchecked indexed access and verbatim module syntax keep mappings between rows and entities honest. |
| ORM | Drizzle ORM (1.0 release candidate) | The subject of the study: typed SQL, explicit schemas, migrations through drizzle-kit. |
| Driver | postgres.js | Driver used by Drizzle for PostgreSQL. |
| Database | PostgreSQL in a container | Real engine behavior (locks, row-level security, `SKIP LOCKED`) is the thing being tested. |
| DI container | dockdi | Wires the Transactor, repositories and use cases; keys are classes. |
| Validation | zod | Validates external input at the boundary. |
| Queue | BullMQ on Redis | Receives outbox events as jobs and runs the consumer with its own retry and backoff; Postgres stays the source of truth. |
| HTTP layer (planned) | Elysia | Typed routes in front of the use cases, with the header and error mapping the scripts do not need. Not built yet. |
| Ids | UUID v7, generated in the application | Time-ordered ids that suit keyset pagination and index locality; known before insert. |
| Seeding | drizzle-seed | Generates large datasets to compare pagination strategies. |

## Topology

An application process, an outbox worker process and a queue consumer process, plus PostgreSQL and Redis containers. Today there is no network surface: entry points are scripts that simulate requests. An Elysia HTTP layer is planned to sit in front of the same use cases.

```
entry point (simulated request: actor + tenant; scripts today, Elysia planned)
   -> zod validation
   -> use case (application layer)
        -> Transactor: BEGIN, set tenant for the transaction
             -> domain entities
             -> repositories (writes) / read queries (reads)
             -> audit recorder, outbox insert
           COMMIT

outbox worker (separate process, relayer role)
   -> claims pending events (FOR UPDATE SKIP LOCKED)
   -> adds one job per event to a BullMQ queue (job id = event id)
   -> marks the event delivered

queue consumer (separate process) <- BullMQ queue on Redis -> logs / fake webhook
```

Layers: a domain layer with no persistence knowledge, an application layer of use cases, repository and query implementations, a data-access layer holding the Transactor, and the database definitions (tables, policies, migrations). Dependencies point inward toward the domain.

## Infrastructure

Local only: a PostgreSQL container and a Redis container, both started with docker compose. Provisioning scripts for roles, stores, schemas, grants and defaults run once at bootstrap. Redis holds only the BullMQ queue and must persist its data to disk (append-only file), because a job it has accepted exists nowhere else once the outbox marks the event delivered. No caches, CDN or other provisioned resources, and no environments beyond the developer machine. Engine-level details are in the persistence reference.

## Cross-cutting patterns

- **One transaction owner.** Only the Transactor begins a transaction and sets the tenant on it. This is what makes row-level security and audit context impossible to forget.
- **Tenant isolation lives in the store.** Application code does not filter by tenant as its main defense; policies do, and the application connects as a role that is subject to them.
- **Atomic side effects.** Audit entries and outbox events are written in the same transaction as the change they describe, so they cannot diverge from it.
- **Deferred work through the outbox.** Anything that must happen after commit is an event recorded in Postgres, handed by a polling worker to the queue, and processed by a consumer, never inline in the request path. Delivery is at least once, so consumers tolerate duplicates.
- **Stateless application.** All business state is in PostgreSQL and the only other state is queued jobs in Redis; the processes can be restarted at any time.
- **Reads are bounded.** Every list is keyset-paginated; there are no unbounded fetches.
- **Secrets stay out of code and logs.** Credentials come from environment files that are not committed; audit entries record that a secret changed, never its value.
- **Error handling.** Database errors are translated into domain-level errors at the data-access layer so callers do not depend on driver codes.

## Open architecture decisions

- **Stock ownership.** Stock starts inside the catalog schema. Extracting it into its own inventory schema is a planned refactor; the trade-off is a second aggregate in the checkout transaction versus simplicity.
- **Audit capture.** Application-level recording is the baseline. Whether to also compare snapshot versus diff storage, and database triggers, depends on what the first implementation shows.
- **Concurrency strategy.** Row lock, conditional atomic update and optimistic version check are all implemented for comparison; which one the checkout keeps by default is decided from the measured results.

---

## Non-goals

- No real authentication or frontend. The HTTP layer is planned in its own slice and does not exist yet.
- No external message broker service; the queue is BullMQ on Redis.
- No production deployment concerns.
