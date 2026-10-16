# poc-persists-data

A proof of concept for data-persistence patterns with Drizzle ORM on PostgreSQL, exercised on a multi-tenant mini online store with an internal wallet: transactor manager, repositories with CQRS lite, audit trail, concurrency, idempotency, outbox (handed to a BullMQ queue on Redis), soft delete, migrations, row-level-security multi-tenancy, keyset pagination. Bun and TypeScript. An Elysia HTTP layer is planned.

The code is currently an empty scaffold: the directories and path aliases exist, the database provisioning is in place, and nothing else is implemented yet.

---

## Knowledge base layout

| Path | Holds |
|---|---|
| `.claude/docs/` | Self-contained references: vision, components, topology, persistence, mechanisms, build approach, and the delta methodology |
| `.claude/rules/` | Conventions auto-loaded when a matching file is opened or edited |
| `.claude/skills/` | The project's knowledge-base skills: surveyor, specifier, archivist, sentinel |
| `.claude/settings.json` | Permission policy, see Permissions below |
| `deltas/` | Per-slice `<slice>.spec.md` and optional `<slice>.design.md`; empty so far |

## Repo layout

| Path | Purpose |
|---|---|
| `source/core/` | Domain layer, one folder per bounded context |
| `source/app/` | Use cases |
| `source/repos/` | Drizzle repository implementations (write side) and CQRS-lite read queries |
| `source/keys/` | DI key classes for dockdi, one per `*.dockey.ts` file |
| `source/infra/` | Plumbing: environment, container wiring, worker |
| `drizzle/dal/` | Data-access layer, including the Transactor |
| `drizzle/database/` | Drizzle schema definitions per Postgres schema, policies, helpers |
| `drizzle/migrations/` | Generated and hand-written migrations |
| `docker/data/` | PostgreSQL compose file and bootstrap scripts for roles, stores, schemas, grants |
| `docker/bull/` | Redis compose file, server configuration and ACL users for the BullMQ queue |
| `docker/*/secrets/` | Secrets of each docker service; real files are git-ignored, only the `*.sample` files are committed |
| `cmd/` | Entry-point scripts that simulate requests |

Import aliases for these folders are defined in `tsconfig.json`.

## Setup & common commands

| Task | Command |
|---|---|
| Install dependencies | `bun install` |
| Start PostgreSQL and Redis | `bun run db:up`. First copy each sample to its real name: `docker/data/secrets/.env.sample` to `.env`, `docker/bull/secrets/users.acl.sample` to `users.acl` (replace every `change-me-*` with a real password) and the root `.env.sample` to `.env`, with the `bull` password also in `BULL_REDIS_URL` |
| Stop both | `bun run db:down` |
| Recreate the databases from scratch | `bun run db:reset`; the bootstrap scripts only run on an empty volume, so a change to roles or grants needs it |
| Verify roles, schemas and grants | `bun run db:check` |
| Apply migrations | `bunx drizzle-kit migrate` (needs `POSTGRES_SAMPLER_URL`) |
| Generate a migration from the models | `bunx drizzle-kit generate --name <name>` |

There is no test runner, linter, build or CI yet, and `package.json` defines no scripts for migrations.

## Permissions

The full policy lives in `.claude/settings.json`. Reading environment and secrets files, `git push` and `git pull` are denied; read-only git commands, `docker compose`, `docker exec`, `curl` and web search are pre-approved.

## Conventions

- Code, identifiers and runtime messages are in English; scoped rules live in `.claude/rules/`: layering of bounded contexts, transaction ownership, schema-qualified names, list pagination, input validation, delta editing and scope.
- Changes to anything in the knowledge base go through the matching skill, not by hand.
- `ROADMAP.md` at the repo root tracks build progress, one step per phase of the approach.
- Secrets never enter git: each docker service keeps them in its own `secrets/` folder, and only samples are versioned.

---

## Non-goals

- No real authentication or frontend; the acting user and tenant are simulated.
- No external message broker service; the queue is BullMQ on Redis, and the Elysia HTTP layer is planned, not built.
