---
paths:
  - "**/source/core/**"
---

# Bounded Context Layering Conventions

This governs the internal folder and file layout of every bounded context under `source/core/`, following a DDD tactical layering organized by semantic sub-slice: each bounded context is split into the cohesive concepts it holds, not into technical layers. It applies to every bounded context there, including the one holding primitives shared across the others.

---

## Bounded context folders

- Each bounded context is its own folder directly under `source/core/`, named as a two-word kebab-case pair, because a shared naming shape makes the set of bounded contexts scannable as a flat list rather than a mix of single words and long compounds.
- The second word is chosen to be descriptive of that specific context, not a suffix repeated across every bounded context, because a repeated suffix (e.g. always `-domain` or always `-core`) stops carrying information the moment every folder has it — it becomes noise instead of a signal.

## What core may depend on

- A bounded context imports only the shared-kernel bounded context, never another bounded context. Collaboration between contexts happens in the application layer, which may use several of them. Letting contexts import each other in core is how they end up in import cycles and coupled through their internals, so that neither can be understood or tested on its own.
- Core never imports the application layer, infrastructure, persistence, runtime configuration, or any framework or I/O library. The dependency direction is what keeps the domain replaceable around its adapters: once core imports one adapter-side module, every change on that side can break the domain. When core needs something from that side, it declares a contract instead.

## Semantic sub-slices

- A bounded context splits into one subfolder per sub-slice — a cohesive domain concept, typically one aggregate plus everything that exists only to serve it (its value objects, policies, events, errors, and contracts). The sub-slice folder is named with a single short word naming that concept from inside the bounded context, because the bounded context folder already supplies the qualifier: a lifecycle context holding a definition and its executions gets `definition/` and `execution/`, not a repeat of the context's own noun in front of each.
- There is no split by technical layer (no separate folder for the domain model versus the contracts it exposes). Grouping by layer scatters one concept across two trees and forces every change to that concept to touch both; grouping by concept keeps everything that changes together in one folder.
- A shared-kernel-style bounded context (primitives shared across bounded contexts: base value objects, shared ids, the base domain error, shared contracts) follows the exact same shape — its primitives are grouped into sub-slices by concept (e.g. everything about identifiers in one sub-slice), with no separate carve-out.
- Anything every bounded context needs lives in the shared kernel, not in the context that happens to own the data behind it. Admission to a tenant (membership standing, required second factor, permission check) is the example: every context's endpoints run it, so its policy and the read model that policy decides on are shared-kernel, and the context that owns the membership tables implements the reads and the use case that runs the admission.
- Sub-slices are always a single level deep — a sub-slice never nests further subfolders. If a concept grows enough to want internal structure, that's a signal it's really two sub-slices side by side, not one with a nested tree.
- Every bounded context uses sub-slice folders, even one holding a single concept today, because deciding folder shape per context based on how many concepts it currently has is exactly the kind of ad hoc call that drifts silently as the context grows.

```
source/core/
  <bounded-context>/
    index.ts
    <subslice-a>/
      <subslice-a>.aggregate.ts
      <subslice-a>.vos.ts
      <subslice-a>.policies.ts
      <subslice-a>.errors.ts
      <subslice-a>.repo.ts
      <subslice-a>.contracts.ts
      ...
    <subslice-b>/
      ...
```

## File naming inside a sub-slice

- Files are named `<subslice>.<kind>.ts`, where `<subslice>` matches the folder name, and `<kind>` is one of eight, each answering a single question:

| Group | Kind | Holds |
|---|---|---|
| Model | `aggregate` | The aggregate root, plus the state shape its reconstitution factory accepts |
| Model | `entities` | Entities owned by the aggregate that aren't the root |
| Model | `vos` | Value objects, including the sub-slice's typed identifiers and closed sets of literal values (a state, a tier) |
| Behavior | `policies` | Pure domain rules that don't belong to a single entity: a decision computed from several values, a threshold policy, a domain service. No I/O; inputs in, verdict out |
| Signals | `events` | Domain events the aggregate emits |
| Signals | `errors` | The domain error the sub-slice raises, with its closed set of codes |
| Boundary | `repo` | The write-side persistence interface, plus the simple reads a write needs to decide: load one aggregate (by id, by natural key, or locked for update), count rows to enforce a limit, and insert or update, including compare-and-set transitions |
| Boundary | `contracts` | Everything else that crosses the sub-slice's boundary: non-persistence interfaces (a notifier, a session writer), request/response DTOs, published-event contracts, and any type an outside caller has to build or receive |

- There is no catch-all kind. A type that crosses the boundary goes in `contracts`; a type internal to the model goes beside the model it describes. A catch-all file is where a type ends up whenever its author didn't decide which of those it is, and it hides that undecided boundary.
- Persistence is split CQRS-lite between the `repo` file and read-side queries. The test is the return type: a method that writes, or returns an aggregate, a count, or a boolean a write decides on, belongs to the repository; a read model for a reader is a query, which core does not declare. A query is a concrete class on the persistence side, one file per query named after what it reads with its full noun, and it never returns an aggregate. Its read model, whose name ends in `View`, is declared beside the query, except when a core policy decides on it: that one read model lives in core, in the `contracts` file of the sub-slice that owns the policy (or the shared kernel when several contexts use it). Keeping the two apart stops the repository from growing one bespoke finder per screen, and keeps read models free to join across tables without pretending to be aggregates.
- Method names follow fixed verbs, so a reader knows the shape of a call before opening it. A repository uses `find…` (load by id or natural key), `lock` (load for update), `insert`, `update`, `transition` (a compare-and-set; it returns whether it applied, or, when every caller would answer a stale transition with the same domain error, raises that error itself, so the check is written once), and `count…`. A name outside those verbs is a signal the method is on the wrong side: a read for a reader is a query, which exposes exactly one method, `execute`, because its file and class name already say what it reads.
- Only the kinds a sub-slice actually needs exist — a sub-slice with no domain events has no `events` file, and one with nothing crossing its boundary has no `contracts` file — because an empty placeholder communicates nothing a missing file doesn't already communicate.
- The `<subslice>.` prefix is kept even though the folder already disambiguates, so that editor tabs, search results, and stack traces identify a file unambiguously without its path.
- A `contracts` file holds only genuine interface/DTO declarations. It never re-exports a concrete aggregate, entity, or domain-error class just to make it reachable from outside — the barrel already does that — so a sub-slice with nothing to declare simply has no `contracts` file rather than one filled preemptively.
- Files within a sub-slice import each other by relative path. A sub-slice that needs something from the shared kernel imports it through that context's barrel, never by reaching into one of its sub-slice folders.

## The barrel is the only public surface

- Each bounded context has an `index.ts` at its own root, acting as its single public entry point: it re-exports every file of every sub-slice via `export * from "./<subslice>/<file>"` — one line per file that exports at least one symbol. Nothing outside the bounded context imports from a sub-slice folder directly, because that would let other contexts (or the application layer) couple to internal file tenant that is free to change without notice.
- The `export` keyword inside a concrete file is the public/private gate, not the barrel — a symbol that must stay internal to the bounded context simply isn't exported from its own file, rather than being filtered out by hand in `index.ts`. This trades barrel-level curation for trusting that gate: once a file exports something, it flows through `export *` automatically, so `index.ts` only changes when a file is added or removed, never because a file gained a new export.
- Because every sub-slice's exports land in one flat namespace at the barrel, exported symbol names must be unique across the whole bounded context. Names carry their full domain noun (e.g. a definition sub-slice's id type is named after the full concept, not a bare `Id`) rather than relying on the folder for disambiguation, since the folder is invisible to importers.

## Contracts

- A contract lives in the `repo` or the `contracts` file of the sub-slice it serves, and a contract every bounded context shares (such as the outbox writer) lives in the shared-kernel bounded context's own sub-slice. Every contract stays in core, including ones only the application layer calls (a scheduler, a lock, a cache), because a contract belongs to the side that depends on it. Declaring it in core keeps every dependency pointing inward.
- A contract interface's name starts with `I` followed by its role (`I<Aggregate>Repository`, `I<Role>`), matching the file it lives in. Its implementation drops the `I`. A persistence implementation takes no technology prefix, because the project has exactly one persistence technology and a prefix would only repeat it. An infrastructure implementation ends in `Adapter`. The contract and its implementation then never collide in a flat namespace, and an injection site reads as "depends on the interface", not on the concrete class.
- Mapping between a persisted row and a domain object belongs to the persistence layer, in a mapper beside the repository. The mapper serves the aggregate only; each query maps its own rows inside its own file, so changing one query's joins or columns never touches another. The mapper builds the aggregate's state with the same value-object parsers the domain uses, so a row that drifted from the domain's rules fails on read instead of flowing in. Columns that hold a closed set take their allowed values from the core literal sets, so the row type and the domain type are the same literal union.
- A contract is written in the domain's language (a report, a version, a fencing token), never a technology's (a connection, a queue option, a script). The test for where an interface belongs is who consumes it. If core or the application layer consumes it, it is a contract and lives here. If only adapters consume it and it speaks a technology's vocabulary, it is not a contract: it lives beside those adapters, and core never declares it. Declaring it here would make core depend on a technology.
- When a contract's signature starts needing a technology's vocabulary, split it into a domain-language contract here and an adapter-internal interface in infrastructure, instead of letting the technology leak inward.

## Domain errors

- Every domain error extends the shared kernel's base domain error and carries a stable `snake_case` code. Error codes are part of the API's stable contract, so the HTTP layer maps a code to a status and a client-facing code without knowing each error class, and renaming a class or rewording a message never breaks a client.
- Each sub-slice has one error class, not one class per failure. It is declared by extending the class the base error's `define` factory returns for a map of code to message, and its code type is derived from the class, so the two can never drift. A status map keyed by that union is checked for exhaustiveness: a new code without a status fails to compile.
- The message is fixed per code, stays in English, and never interpolates a value. Variable data (a limit, a current state, a permission name) travels in the error's structured details. A fixed message keeps error monitoring grouping one failure as one issue, and keeps user-supplied values and document or case content out of logs.

## Value objects

- A value object is a branded primitive, built on the shared kernel's brand type, with a same-named constant object that holds its parser and any behavior. Its only constructor is the parser, which normalizes, validates, and raises the sub-slice's domain error. The brand keeps two string-backed concepts from being swapped silently, while equality stays `===` and the value serializes and maps to a column with no wrapping or unwrapping.
- Identifiers follow the same shape through the shared kernel's identifier factory, one declaration per id kind. A closed set of literals (a role, a status, a kind) follows it too, through the shared kernel's literal-set factory, which gives every set the same `values`, `is`, and `parse`; a set whose rejection is part of the API contract passes its own error to the factory. A bare constant array beside a hand-written guard is not used, because every set would grow its own shape. A class-based value object with a wrapped field and an `equals` method is not used: it adds an unwrap at every boundary and an equality method that the brand already gives for free.

## Aggregates

- An aggregate extends the shared kernel's aggregate base, typed by a named state interface. The base assigns the state and freezes the instance, so the fields are `readonly` both in the type system and at runtime, and the aggregate never repeats its field list in a constructor, a getter, or a serializer.
- The constructor is private and takes the whole state object, never positional arguments. Positional constructors let two arguments of the same type swap silently. Creation goes through intention-named factories that all take `(input, now)`, a named input object plus the clock, and reconstitution goes through a `restore` factory that trusts its input, because the persistence mapper already parsed every field.
- No getters and no snapshot method. A field is read directly, the state is the instance itself, and a derived fact is a method whose name says it computes (`isActive()`), not a getter that looks like a stored field.
- A state-changing operation returns a new instance built from a copy of the current state plus a patch, through the patch method the aggregate base provides, never a mutation of the receiver and never a hand-written copy per aggregate. A caller still holding the old instance keeps a value that stays valid. An operation that leaves the state unchanged may return the receiver itself, so a caller can skip the write by identity.
- An operation that raises a domain event returns that event alongside the new instance and never publishes it itself. The aggregate can't know whether its change will commit, so only the caller, which owns the transaction, can record the event safely, in the same transaction as the change.

---

## Non-goals

- This rule governs internal layering and file naming only. It does not decide which domain concepts belong to which bounded context, how a bounded context is carved into sub-slices, or where one aggregate's boundary ends and another's begins — those are per-bounded-context decisions made in that slice's own `spec.md`, not here.
- It doesn't govern the application or infrastructure layers' own layout — those are separate conventions with their own trigger paths.