---
paths:
  - "**/source/app/**"
---

# Application Use-Case Layering Conventions

This governs the internal folder and file layout of the application layer, which orchestrates use cases over the domain's bounded contexts. It covers how use cases are grouped, which files a use case holds, what each one may depend on and receive by injection, and how a use case records audit entries and the domain events its aggregates raise. It doesn't cover the domain layer's own layout (that has its own rule), the persistence implementations, or any single use case's behavior (that belongs to its slice's spec).

---

## Folder shape

- The application layer mirrors the domain's **bounded contexts**, but not their sub-slices: one folder per bounded context, named exactly as in core, so a use case's owning context is obvious from its path.
- The shared kernel is not mirrored. It is a domain concept and exists only in core, so the application layer holds nothing but real bounded contexts and their use cases.
- Inside a bounded context, each use case gets its own folder, named verb-noun in kebab-case after what it does (place an order, adjust stock), never after a layer ("order service"). This avoids mirroring sub-slices because many use cases cross more than one aggregate of the same context, such as a checkout that writes an order and its items, or a member removal that touches memberships and the invitations of the same email. A sub-slice folder would have no natural owner for them.
- Use-case folders are one level deep and never nest. A use case that seems to need internal structure is really two use cases.
- A use-case folder exists only for a use case with a handler that orchestrates injected repositories, queries, or contracts. Everything inside it feeds that one use case; the only things it receives from outside are its injected dependencies. Logic that only configures a third-party library (HTTP server options, API documentation generation) has no handler and touches none of the project's own state, so it lives in the infrastructure layer that embeds that library, never here.
- Admission into a tenant is not repeated or reinvented per context. It is a use case of the bounded context that owns the membership data, and its decision belongs to a shared-kernel policy in core. Every tenant-scoped use case is admitted by it before doing anything else, in the same run, as the tenant-onboarding slice specifies. A handler never inspects roles itself, because two copies of the permission rule drift apart silently.

```
<context>/
├── <context>.dockey.ts       # tokens and bindings of the context's handlers, repositories, queries
├── <context>.plugin.ts       # composes use-case plugins, route prefix, error → status
├── <context>.views.ts        # output shapes shared by several use cases
└── <use-case>/
    ├── <use-case>.schema.ts
    ├── <use-case>.handler.ts
    ├── <use-case>.errors.ts
    └── <use-case>.plugin.ts
```

## Files inside a use-case folder

Files are named `<use-case>.<kind>.ts`, with the prefix kept for the same reason as in core: tabs, search results, and stack traces identify the file without its path. Only the kinds a use case actually needs exist.

| Kind | Holds |
|---|---|
| `schema` | The runtime validation schemas for the use case's input and output. Their static types are inferred from them and never declared by hand, so the runtime check and the type can't drift. |
| `handler` | The use-case class: it receives the parsed input, orchestrates repositories, queries, and contracts, and returns the output. It is the entry service a transactional run resolves. |
| `errors` | Orchestration errors that aren't domain rules, e.g. a requested aggregate that doesn't exist. Domain errors stay in core. |
| `plugin` | The HTTP plugin that exposes this use case's route, reusing the same schemas for the request and the response. Present only for use cases reachable over HTTP. |

- An output shape that two or more use cases return (the same aggregate presented the same way) is declared once, in the context's views file, as a schema plus the function that maps the aggregate to it. The use cases' schemas and handlers reference it instead of repeating the fields, so the shape and its mapping can't drift between routes. A shape only one use case returns stays in that use case's schema.
- Schemas validate **shape only**: types, formats, presence, bounds, and conversion from wire values (e.g. an ISO string to a date). A business invariant is never re-checked in a schema, even if that would be easy, because it already lives in the aggregate. Two copies of one rule drift apart silently. Entries parse with the schema before the handler runs, so the handler only ever sees the parsed type.
- The outbox relay and the queue consumer are infrastructure processes, not application-layer files, and so is any consumer of domain events (a projection, a notification). None of them lives here.
- Tests don't live inside a use-case folder. Keeping them out keeps each folder limited to what ships.

## Dependency injection

- Tokens and the bindings that satisfy them live together in one dockey: a single class holding the tokens as static members and a module that binds them. Keeping both in one place means the token and what fulfills it can't drift apart across two files. A concrete class's token is declared from the class, so the class name is written once and the token's label follows it; an interface's token is declared with its type and a label. A dockey's module names every token by its dockey's class, with no destructuring and no alias, because a destructured token can collide with an imported class of the same name.
- Each bounded context's dockey lives at the root of that context's folder in the application layer, named after the context, beside its plugin. It declares the tokens of that context's handlers, repositories and queries and binds each one to its class. Keeping it beside the use cases it wires means adding a use case touches only its own context folder, and keeping it in its own file rather than beside each class keeps handlers free of the DI library. Infrastructure concerns keep their dockeys in the project's keys folder, one per concern, owning the tokens shared across contexts (the database and the Transactor, the outbox writer, the Recorder). A repository or a query belongs to exactly one context, so its token has no owner to choose; a shared contract does, which is why it lives in an infrastructure dockey.
- A context's dockey imports the infrastructure tokens it needs from the dockey that owns them, so a contract consumed by two contexts doesn't have to pick one of them as its owner. Importing a token loads that dockey's implementations too, so a dockey's top level may only declare tokens; every use of an imported implementation stays inside its module function, which is what keeps an import cycle through a dockey harmless.
- Each process's composition root, in the process entrypoint, loads the infrastructure modules plus the per-context dockeys it needs. Nothing else imports an infrastructure module.
- A handler receives by injection **only** the repositories, queries, and contracts it orchestrates, never the Transactor. The Transactor resolves the handler inside a run's child scope, after the transaction executor and the run's context are bound, so every repository and query the handler receives already runs through that run's transaction. A handler that also received the Transactor could only open a second, independent transaction, which breaks the atomicity of the write with its audit entry and its outbox event. A run never nests, so a use case that seems to need several transactions is a sign it should be split.
- A handler that needs the tenant or the actor reads them from the run's context, never from its input, because a tenant or an actor in a request body could name someone else's. Only the entry builds the context, through the constructors for a tenant request, a platform request or a system run, and nothing changes it during the run.
- A handler receives repositories and contracts through their core interfaces. A query has no interface: the handler types it as the concrete persistence class through a type-only import, which is the one persistence import the application layer is allowed, and its token lives in its context's dockey, like that context's repositories.
- Handler bindings are never singletons. A handler holds executor-bound repositories and queries, so a singleton would keep the transaction of the first run that built it, and that transaction is already closed by the next run.
- An entry file (a plugin, or any script that invokes a use case) receives the Transactor as a factory argument and opens the run itself: it builds the context, resolves the handler's token inside the run, and calls the handler with the parsed input. It uses a factory rather than DI resolution because the Transactor is itself built from the container. The factory takes its dependencies as positional parameters while each has a distinct type, so two of them cannot be swapped silently, and declares no dependencies interface of its own.
- Admission and idempotency key resolution happen inside that same run, before the handler's own work and in that order, as their slices specify. A handler never re-implements either, and never opens a run of its own to do so.
- **Exception: a handler with no executor-bound repository or query.** A handler that orchestrates only non-transactional contracts is resolved outside any run, from the container or once by the factory that builds its entry. Opening a database transaction for it would hold a pooled connection for the whole call while nothing writes through it. The moment such a handler gains a repository or query, it goes back to being resolved inside a run.

## HTTP plugins and the public surface

- Each bounded context has one plugin of its own that composes its use cases' plugins and sets their shared route prefix. The api entrypoint mounts only these per-context plugins, never a use case's plugin directly, so adding a use case touches its own context and nothing outside it.
- The per-context plugin maps errors to HTTP responses in one place, both domain errors and the context's orchestration errors, and lets the persistence errors the repositories left untranslated fall through to the entrypoint's shared mapping. Mapping per use case would repeat the same translation in every route and let identical errors drift to different statuses. The mapping table itself belongs to the HTTP slice's spec.
- The HTTP framework is imported **only** in plugin files and the entrypoint. Handlers, schemas, errors, and dockeys depend on it nowhere, because the outbox worker and the queue consumer run in other processes and must load only their own frameworks.
- A bounded context in the application layer has no barrel. Its public surface is its dockey and its plugin, both imported directly by the entrypoint; its handler files are imported only by its own dockey. A barrel would have to leave out every framework-bound file to keep a process from loading a framework it does not use, and would be left exporting only what nothing outside the context imports. Per-context plugins import their use cases' plugin files by relative path.

## Audit entries and domain events

- A handler decides which business action is audited and calls the Recorder in the same run as the change, with an action name and the fields that action's allowlist permits. Tenant, actor and origin always come from the context, never from the call's arguments. Repositories never audit on their own, because a repository sees rows while only the use case knows the business action; and a rolled-back run then removes the entry together with the change.
- A handler that changes an aggregate takes the domain event the aggregate returned and appends it to the outbox, through the outbox writer, in the same run as the aggregate write. It never publishes to a queue, a bus, or any other system directly. A direct publish either announces a change that later rolls back or loses the event if the process dies right after the commit. The outbox makes the event commit with the change or not at all.
- A handler never performs, in reaction to its own write, an effect that must follow the commit (a notification, a projection, an integration). Those effects belong to the event consumers, which receive the event from the outbox, so they happen after the commit and survive a crash.

---

## Non-goals

- Doesn't decide which use cases a bounded context exposes or what they guarantee, nor the HTTP status and code of each error: those belong to the slices' specs.
- Doesn't govern the outbox relay, the queue consumer or the persistence implementations; those are infrastructure and have their own conventions.
- Doesn't cover authentication: the actor and tenant are simulated and arrive through the context, and membership is checked by admission.
