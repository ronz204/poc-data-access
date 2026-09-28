# Cómo funciona la persistencia multi-tenant

Esta guía explica, de lo general a lo particular, cómo se conectan las piezas del proyecto:
Postgres con RLS, los roles, la DAL (`drizzle/dal/`) y la inyección de dependencias con `dockdi`.
Al final hay un recorrido completo por `cmd/sample.boot.ts`.

---

## 1. La foto completa

```text
┌──────────────────────────────────────────────────────────────────────┐
│  cmd/sample.boot.ts  (o una ruta HTTP, un job, etc.)                 │
│                                                                      │
│    transactor.forTenant(acme).run(ProjectServiceToken, (s) => ...)   │
└───────────────┬──────────────────────────────────────────────────────┘
                │ 1. abre transacción + fija tenant
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Transactor  (drizzle/dal/dal.transactor.ts)                         │
│    - BEGIN / COMMIT / ROLLBACK                                       │
│    - set_config('app.tenant_id', ...)                                │
│    - crea un scope con la tx, el tenant, el actor y el contexto      │
│    - normaliza errores (ErrorClassifier)                             │
└───────────────┬──────────────────────────────────────────────────────┘
                │ 2. resuelve el servicio dentro del scope
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Servicios  →  Repositorios  →  tx (drizzle)                         │
│  (no saben nada de transacciones, tenants ni RLS)                    │
└───────────────┬──────────────────────────────────────────────────────┘
                │ 3. SQL como rol `runner`
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                          │
│    RLS: tenant_id = app.tenant_id  →  sólo ves/escribes lo tuyo       │
└──────────────────────────────────────────────────────────────────────┘
```

La idea central: **el código de negocio nunca escribe `WHERE tenant_id = ?`**. La base de datos
filtra sola gracias a RLS, y el `Transactor` es el único que le dice a Postgres "quién es el tenant".

---

## 2. Multi-tenant y RLS en 5 minutos

### 2.1 Una base, muchos clientes

Todas las tablas de negocio (`projects`, `tasks`, `memberships`) tienen una columna `tenant_id`.
Los datos de Acme y de Globex viven en la misma tabla:

| id  | tenant_id | slug |
| --- | --------- | ---- |
| p1  | acme      | web  |
| p2  | globex    | web  |
| p3  | acme      | api  |

### 2.2 Los tres roles

| Rol       | Para qué                         | ¿RLS le aplica?                                  |
| --------- | -------------------------------- | ------------------------------------------------ |
| `tenant`  | superuser del contenedor         | **No**, un superuser ignora RLS siempre          |
| `sampler` | corre migraciones, dueño de `core` | **No**, el dueño de la tabla también la ignora |
| `runner`  | la app en operación              | **Sí**, es el rol al que apuntan las policies    |

Por eso la app se conecta con `POSTGRES_RUNNER_URL`. Si se conectara como `sampler` o `tenant`,
las policies existirían pero **no filtrarían nada**.

### 2.3 La policy

`drizzle/database/policies/isolation.policy.ts` genera, para cada tabla con `tenant_id`, algo así:

```sql
CREATE POLICY tenant_isolation ON core.projects
  AS PERMISSIVE FOR ALL TO runner
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

- **`USING`** filtra lo que puedes **leer, actualizar o borrar**. Las filas que no cumplen
  simplemente "no existen" para ti: no hay error, solo no aparecen.
- **`WITH CHECK`** valida lo que intentas **escribir**. Si insertas una fila con otro `tenant_id`,
  Postgres responde `42501 new row violates row-level security policy`.
- **`current_setting('app.tenant_id', true)`** lee una variable de la sesión. El `true` significa
  "si no existe, devuelve NULL en vez de fallar".
- **`nullif(..., '')`** existe por una trampa de Postgres: una vez que una conexión usó
  `set_config`, en las transacciones siguientes la variable ya no vale `NULL` sino `''`, y
  `''::uuid` revienta. Con el pool de conexiones esto pasa todo el tiempo.

### 2.4 ¿Y si no hay tenant?

`tenant_id = NULL` nunca es verdadero en SQL, así que **sin tenant no ves nada y no puedes
escribir nada**. Es un "cerrado por defecto": olvidarte de fijar el tenant da cero filas, no
datos de otro cliente.

---

## 3. Las piezas de la DAL

| Archivo             | Qué contiene                                                | En una frase                                                  |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| `dal.transactor.ts` | `Transactor`, `TransactorContext`, `TxToken`, `TenantToken`, `ActorToken`, `ContextToken`, `TransactorToken` | El dueño de las transacciones y del contexto (tenant + actor), y las "llaves" con las que dockdi los entrega |
| `dal.chronicler.ts` | `Chronicler`, `ChroniclerToken`, `AuditEntry`               | Escribe la auditoría en `auditrail` (sección 9)               |
| `dal.exceptions.ts` | `PersistenceError`, `TransactionScopeError`                 | Errores normalizados                                          |
| `dal.classifier.ts` | `ErrorClassifier`                                           | Convierte errores crudos de Postgres en `PersistenceError`    |
| `dal.translator.ts` | `ViolationTranslator`                                       | Convierte violaciones de constraints en errores de dominio    |

Los tokens viven junto al `Transactor` porque es él quien los llena en cada `run`: así queda
claro quién los provee, y quien los usa los importa todos de un solo lugar:

```ts
import {
	ActorToken,
	ContextToken,
	TenantToken,
	Transactor,
	TransactorToken,
	TxToken,
} from "@dal/dal.transactor";
```

---

## 4. El `Transactor`, paso a paso

### 4.1 Su estado

```ts
export interface TransactorContext {
	readonly tenantId: string | null;  // en qué tenant se trabaja
	readonly actorId: string | null;   // quién trabaja
}

private constructor(
	private readonly container: Container,         // dónde resolver servicios
	private readonly executor: Executor,           // la base (db) o una transacción (tx)
	private readonly context: TransactorContext,   // tenant y actor, o ninguno
	private readonly nested: boolean,              // ¿vivo dentro de una transacción abierta?
	private readonly client: postgres.Sql | null,  // el pool; sólo el principal lo tiene
) {}
```

Todo es `readonly`: **un `Transactor` nunca cambia**. Si necesitas uno distinto, se crea otro.
El constructor es privado, así que sólo hay tres puertas de entrada: `create`, `forTenant` y
`forActor`.

El tenant y el actor viajan juntos en un **contexto**. Así, sumar algo más en el futuro (por
ejemplo un `requestId`) no cambia la firma del constructor.

### 4.2 `Transactor.create(container, client)`

Crea el `Transactor` **principal**: sin tenant, sin actor, no anidado, dueño del pool.
Se crea una sola vez al arrancar la app.

```ts
const transactor = Transactor.create(container, postgres(env.POSTGRES_RUNNER_URL));
```

### 4.3 `forTenant(id)` y `forActor(id)`: copias, no modificaciones

```ts
forTenant(tenantId: string): Transactor {
	return this.with({ tenantId });
}

forActor(actorId: string): Transactor {
	return this.with({ actorId });
}

private with(patch: Partial<TransactorContext>): Transactor {
	const context = { ...this.context, ...patch };
	return new Transactor(this.container, this.executor, context, this.nested, null);
}
```

(La versión real de `with` además impide cambiar el contexto desde un anidado, ver sección 6.)

Se pueden encadenar en cualquier orden, y cada combinación tiene su caso:

| Llamada | Tenant | Actor | Caso |
| --- | --- | --- | --- |
| `forTenant(t).forActor(u)` | ✅ | ✅ | Un usuario trabajando dentro de su tenant |
| `forActor(u)` | ❌ | ✅ | Un usuario sobre su propia cuenta (identidad) |
| `forTenant(t)` | ✅ | ❌ | Procesos del sistema: jobs, crons |
| _(ninguno)_ | ❌ | ❌ | Antes de identificar a alguien, por ejemplo un login |

**¿Por qué no simplemente `this.tenantId = id`?** Porque el principal es compartido por todas
las peticiones al mismo tiempo:

```text
petición A: transactor.forTenant("acme")     → tenantId = acme
petición B: transactor.forTenant("globex")   → tenantId = globex   ← pisa a A
petición A: .run(...)                        → corre como globex ❌  (fuga de datos)
```

Con copias, cada petición tiene su propio objeto y no hay forma de pisarse:

```ts
const acmeDb = transactor.forTenant("acme");     // objeto nuevo
const globexDb = transactor.forTenant("globex"); // otro objeto nuevo
// `transactor` sigue intacto, sin tenant
```

La copia recibe `client = null`, así que llamar `close()` sobre ella no cierra el pool por error.

### 4.4 `run(entry, work)`: lo que pasa por dentro

```ts
await transactor.forTenant(acme).forActor(owner).run(ProjectServiceToken, (service) => service.list());
```

Paso a paso:

1. **Abre una transacción** con `executor.transaction(...)` → `BEGIN`.
2. **Crea un scope de dockdi** (una "oficina temporal", ver sección 5).
3. **Fija el contexto** (sólo en la transacción principal, no en las anidadas):
   - Si hay tenant, en Postgres: `select set_config('app.tenant_id', 'acme', true)`. El `true`
     final significa "sólo durante esta transacción": al hacer `COMMIT` o `ROLLBACK` desaparece.
   - Si hay tenant, en el scope: `TenantToken` → `'acme'`, para que los repositorios sepan qué
     `tenant_id` escribir sin que nadie se lo pase a mano.
   - Si hay actor, en el scope: `ActorToken` → `'owner'`.
   - **Siempre**, en el scope: `ContextToken` → `{ tenantId, actorId }`, con `null` donde no hay
     dato.
4. **Deja en el scope** además:
   - `TxToken` → la `tx` de esta transacción.
   - `TransactorToken` → un `Transactor` anidado atado a esta `tx` (ver sección 6).
5. **Resuelve `entry`** (tu servicio) dentro de ese scope. dockdi construye el servicio y sus
   repositorios, inyectándoles esa `tx`, ese tenant y ese actor.
6. **Ejecuta `work(service)`**, tu callback.
7. Si todo sale bien → `COMMIT` y devuelve el resultado.
   Si algo lanza → `ROLLBACK` y el error pasa por `ErrorClassifier.normalize` antes de salir.

El SQL que ve Postgres:

```sql
BEGIN;
select set_config('app.tenant_id', 'acme', true);
select "slug", "name" from "core"."projects";   -- RLS agrega el filtro por tenant
COMMIT;
```

### 4.5 `close()`

Cierra el pool. Sólo hace algo en el principal (el que tiene `client`).

---

## 5. dockdi y los scopes, explicado con una analogía

Piensa en el `container` raíz como **la recepción de una empresa**: sabe cómo construir cada
servicio y repositorio, pero no tiene ninguna transacción.

Cada `run` abre **una oficina temporal** (`container.scope()`):

- La oficina **hereda** todo lo que sabe la recepción (cómo construir `ProjectService`, etc.).
- Pero tiene **cosas propias en su escritorio**: la `tx` de esa transacción, el tenant, el
  actor, el contexto y un `Transactor` anidado.
- Cuando alguien en esa oficina pide algo, dockdi **busca primero en el escritorio de la
  oficina** y, si no está, pregunta a la recepción.

```text
container (recepción)
│  sabe construir: TenantRepository, ProjectService, ...
│  TransactorToken → Transactor principal
│
└─ scope del run  (oficina temporal)
   │  TenantToken     → 'acme'
   │  ActorToken      → 'owner'
   │  ContextToken    → { tenantId: 'acme', actorId: 'owner' }
   │  TxToken         → tx
   │  TransactorToken → Transactor anidado     ← gana sobre el de la recepción
   │
   └─ scope del run anidado  (oficina dentro de la oficina)
         TxToken         → savepoint
         TransactorToken → otro Transactor anidado
         (tenant, actor y contexto no se repiten: los hereda de la oficina de afuera)
```

Por eso un repositorio declarado así:

```ts
container.bind(ProjectRepositoryToken).toClass(ProjectRepository, [TxToken, TenantToken]);
```

recibe **siempre la `tx` y el tenant correctos** sin que nadie se los pase a mano: los busca en
su oficina.

### 5.1 ¿Y si no hay tenant o no hay actor?

Si llamas `transactor.run(...)` sin `forTenant`, el scope **no tiene `TenantToken`**. Cualquier
servicio que dependa (aunque sea indirectamente) de un repositorio con tenant falla al
resolverse con `MissingTokenError`, **antes de ejecutar una sola query**.

Son dos capas de protección:

| Capa | Sin tenant |
| --- | --- |
| App (dockdi) | `MissingTokenError`: el repositorio ni siquiera se construye |
| Base (RLS) | aunque accedas a la `tx` directo, ves `[]` y no puedes escribir |

Con el actor pasa lo mismo: un servicio que pide `ActorToken` (como `ProfileService`, que opera
sobre "mi cuenta") no se construye si nadie se identificó.

¿Y por qué existe `ContextToken` si ya están `TenantToken` y `ActorToken`? Porque hay piezas que
deben funcionar **con o sin** tenant y actor. El `Chronicler` (sección 9) audita tanto un
proyecto nuevo en Acme como un cambio de contraseña sin tenant; si pidiera `TenantToken`,
fallaría en el segundo caso. `ContextToken` siempre existe y trae `null` donde no hay dato.

| Token | ¿Cuándo existe? | Quién lo pide |
| --- | --- | --- |
| `TenantToken` | sólo con tenant | quien **exige** tenant (repositorios de tablas con `tenant_id`) |
| `ActorToken` | sólo con actor | quien **exige** actor (servicios de "mi cuenta") |
| `ContextToken` | siempre | quien funciona en cualquier caso (el `Chronicler`) |

Cuando la transacción termina, la oficina se abandona. La siguiente llamada a `run` abre una
nueva, con su propia `tx`.

---

## 6. El `Transactor` anidado (`nested`)

### 6.1 El problema que resuelve

A veces un servicio necesita **intentar algo que puede fallar y seguir adelante** dentro de la
misma transacción. Ejemplo: crear varios proyectos y saltarse los slugs repetidos.

El problema: **en Postgres, un error dentro de una transacción la deja "abortada"**. Cualquier
query posterior falla con `25P02 current transaction is aborted`:

```ts
await transactor.forTenant(acme).run(ProjectRepositoryToken, async (projects) => {
	await projects.create({ name: "Web", slug: "web" }).catch(() => {});
	await projects.list(); // 💥 25P02: la transacción ya está muerta
});
```

### 6.2 La solución: savepoints

Un **savepoint** es un "punto de guardado" dentro de la transacción. Si algo falla después de
él, puedes volver a ese punto sin perder la transacción completa:

```sql
BEGIN;
INSERT ... 'outer';                  -- ✅
SAVEPOINT sp1;
INSERT ... 'web';                    -- 💥 unique
ROLLBACK TO SAVEPOINT sp1;           -- deshace sólo lo de sp1
SAVEPOINT sp2;
INSERT ... 'api';                    -- ✅
RELEASE SAVEPOINT sp2;
COMMIT;                              -- se guardan 'outer' y 'api'
```

En drizzle, llamar `tx.transaction(...)` sobre una transacción ya abierta crea exactamente eso:
un savepoint.

### 6.3 ¿Qué es entonces el `Transactor` anidado?

Es un `Transactor` cuyo `executor` **es la `tx`**, no la base de datos. Cuando llamas `run` sobre
él, `executor.transaction(...)` se convierte en un savepoint en la misma conexión.

| | Principal (`nested = false`) | Anidado (`nested = true`) |
|---|---|---|
| `executor` | `db` (el pool) | `tx` (la transacción abierta) |
| `run` hace | `BEGIN ... COMMIT` | `SAVEPOINT ... RELEASE` |
| Fija el contexto | sí | no hace falta: lo hereda del scope de afuera |
| `forTenant(otro)` / `forActor(otro)` | permitido (crea otra copia) | **`TransactionScopeError`** |

¿Por qué el anidado no puede cambiar de tenant ni de actor? Porque `set_config(..., true)` vale
para **toda** la transacción, y lo mismo aplica a quién la ejecuta: una transacción tiene un solo
tenant y un solo actor. Si el savepoint los cambiara, el código de afuera seguiría corriendo con
el contexto equivocado, y la auditoría quedaría atribuida a la persona incorrecta.

### 6.4 ¿Por qué `run` registra un `Transactor` nuevo en el scope?

Para que el servicio reciba el anidado **sin enterarse**. Mira `ProjectService`:

```ts
class ProjectService {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
		private readonly transactor: Transactor, // ← inyectado con TransactorToken
	) {}
}
```

- Si `ProjectService` se resuelve **dentro de un `run`**, dockdi le da el `Transactor` anidado de
  la oficina → sus `run` son savepoints.
- Si no existiera ese registro, dockdi le daría el **principal** de la recepción, y su `run`
  abriría **otra transacción en otra conexión**:

```text
run externo (conexión 1):  INSERT 'outer'   ← aún sin COMMIT
  └─ service.transactor.run (conexión 2):  BEGIN ... COMMIT   ← independiente
```

Eso rompe tres cosas:

1. **Atomicidad**: si el externo falla después, lo del interno ya quedó guardado.
2. **Visibilidad**: el interno no ve lo que el externo aún no confirmó.
3. **Pool**: el externo espera al interno, el interno espera una conexión libre... y todo se
   congela si el pool es chico.

Este mecanismo es lo que reemplaza a `AsyncLocalStorage`: **el contexto de la transacción viaja
en el scope de DI**, no en una variable global.

### 6.5 Ejemplo real (`ProjectService.createAvailable`)

```ts
async createAvailable(slugs: string[]): Promise<string[]> {
	const created: string[] = [];
	for (const slug of slugs) {
		try {
			await this.transactor.run(ProjectServiceToken, (service) => service.create(slug, slug));
			created.push(slug);
		} catch (error) {
			if (!(error instanceof SlugTakenError)) throw error;
		}
	}
	return created;
}
```

Con `["api", "web", "docs"]` y `web` ya existente, devuelve `["api", "docs"]` y la transacción
externa hace `COMMIT` sin problemas.

Fíjate que el `run` anidado resuelve **el mismo `ProjectService`** otra vez, pero dentro de la
oficina del savepoint: su `ProjectRepository` y su `Chronicler` reciben la `tx` del savepoint.
Por eso, cuando `web` falla, se deshacen juntos el proyecto y su registro de auditoría.

---

## 7. Errores

### 7.1 El problema

Drizzle y postgres.js lanzan errores crudos, a veces envueltos:

```text
DrizzleQueryError: Failed query: insert into ...
  cause: PostgresError { code: "23505", constraint_name: "projects_tenant_id_slug_key", ... }
```

El código de negocio no debería conocer códigos como `23505`.

### 7.2 `ErrorClassifier`

- `classify(error)` → devuelve un `PersistenceError` si reconoce el error, o `null` si no.
- `normalize(error)` → `classify(error) ?? error`. Es lo que usa `Transactor.run` al fallar.

Busca primero el código exacto (`"23505"`) y, si no, la clase de dos dígitos (`"08"` = conexión).

### 7.3 `PersistenceError`

| Campo        | Ejemplo                          |
| ------------ | -------------------------------- |
| `kind`       | `"unique"`                       |
| `code`       | `"23505"`                        |
| `constraint` | `"projects_tenant_id_slug_key"`  |
| `table`      | `"projects"`                     |
| `column`     | `null` (se llena en `not_null`)  |
| `retryable`  | `false`                          |
| `cause`      | el error original (ojo: trae valores reales, no exponerlo al cliente) |

Los `kind` posibles:

| kind            | Cuándo                                             | retryable |
| --------------- | -------------------------------------------------- | --------- |
| `unique`        | dato duplicado                                     | no        |
| `foreign_key`   | referencia a algo que no existe (o de otro tenant) | no        |
| `not_null`      | falta un campo obligatorio                         | no        |
| `check`         | no cumple un `CHECK`                               | no        |
| `exclusion`     | viola un `EXCLUDE`                                 | no        |
| `invalid_input` | formato inválido (uuid mal escrito, texto largo)   | no        |
| `forbidden`     | RLS lo rechazó o falta un GRANT (`42501`)          | no        |
| `aborted`       | se siguió usando una transacción que ya falló      | no        |
| `contention`    | deadlock, serialización, lock ocupado              | sí        |
| `timeout`       | query cancelada por tiempo                         | sí        |
| `unavailable`   | la base no responde / conexión caída               | sí        |

### 7.4 `ViolationTranslator`: de constraint a error de dominio

Cada modelo exporta los nombres de sus constraints:

```ts
export const ProjectConstraints = {
	slug: "projects_tenant_id_slug_key",
	tenantScopedId: "projects_tenant_id_id_key",
	tenant: "projects_tenant_id_tenants_id_fkey",
} as const;
```

Y el repositorio dice "si falla este constraint, lanza este error":

```ts
async create(project: Omit<typeof projects.$inferInsert, "tenantId">): Promise<void> {
	await ViolationTranslator.translate(
		this.tx.insert(projects).values({ ...project, tenantId: this.tenantId }),
		{ [ProjectConstraints.slug]: () => new SlugTakenError(project.slug) },
	);
}
```

- Si falla por `projects_tenant_id_slug_key` → `SlugTakenError`.
- Si falla por otra cosa → `PersistenceError` (o el error original si no se reconoce).

Usar las constantes en lugar de strings sueltos hace que un error de tipeo lo detecte el
compilador.

> Recuerda la sección 6: si atrapas el error traducido y quieres **seguir usando la misma
> transacción**, la operación tiene que ir dentro de un `run` anidado.

---

## 8. Recorrido por `cmd/sample.boot.ts`

### 8.1 Repositorios: sólo SQL

Los repositorios de tablas con tenant reciben dos cosas: la `tx` y el `tenantId`. Nunca le
piden el tenant a quien los llama; lo toman del scope.

```ts
class ProjectRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async create(project: Omit<typeof projects.$inferInsert, "tenantId" | "id">): Promise<string> {
		const id = generateId();
		await ViolationTranslator.translate(
			this.tx.insert(projects).values({ ...project, id, tenantId: this.tenantId }),
			{ [ProjectConstraints.slug]: () => new SlugTakenError(project.slug) },
		);
		return id;
	}

	list() {
		return this.tx.select({ slug: projects.slug, name: projects.name }).from(projects);
	}
}
```

- `Omit<..., "tenantId" | "id">` hace que el compilador **no te deje** pasar un `tenantId` a mano.
- El `id` se genera en la app y se devuelve: el servicio lo necesita para auditar.
- `list()` **no filtra por tenant**. RLS lo hace.
- `UserRepository` sólo recibe la `tx`: `users` es global y no tiene tenant.

### 8.2 Servicios: sólo lógica

```ts
class OnboardingService {
	constructor(
		private readonly tenants: TenantRepository,
		private readonly users: UserRepository,
		private readonly memberships: MembershipRepository,
		private readonly chronicler: Chronicler,
	) {}

	async onboard(userId: string, name: string, slug: string, ownerEmail: string): Promise<void> {
		const tenantId = await this.tenants.create({ name, slug });
		await this.chronicler.record({
			action: "tenant.created",
			entity: "tenants",
			entityId: tenantId,
			changes: Chronicler.created({ name, slug }),
		});

		await this.users.create({ id: userId, email: ownerEmail, name, passwordHash: "sample" });
		await this.chronicler.record({ action: "user.created", entity: "users", entityId: userId, ... });

		await this.memberships.create({ userId, role: "owner" });
		await this.chronicler.record({ action: "membership.created", entity: "memberships", ... });
	}
}
```

Los servicios **no mencionan el tenant ni el actor en ningún lado**: dicen *qué* pasó, y el
`Chronicler` completa *dónde* y *quién* desde el contexto. Todos los inserts, incluidos los de
auditoría, van en la misma transacción porque todos recibieron la misma `tx` de la misma
oficina: si falla el último, se deshace todo.

### 8.3 El cableado (una sola vez, al arrancar)

```ts
const container = new Container();
const transactor = Transactor.create(container, postgres(env.POSTGRES_RUNNER_URL));

container.bind(TransactorToken).toValue(transactor);
container.bind(ChroniclerToken).toClass(Chronicler, [TxToken, ContextToken]);
container.bind(UserRepositoryToken).toClass(UserRepository, [TxToken]);
container.bind(ProjectRepositoryToken).toClass(ProjectRepository, [TxToken, TenantToken]);
container
	.bind(ProjectServiceToken)
	.toClass(ProjectService, [ProjectRepositoryToken, ChroniclerToken, TransactorToken]);
container
	.bind(ProfileServiceToken)
	.toClass(ProfileService, [UserRepositoryToken, ChroniclerToken, ActorToken]);
```

Aquí no existe ninguna `tx`, tenant ni actor todavía. Esos tokens sólo se llenan dentro de cada
`run`.

### 8.4 Un `Transactor` por contexto

```ts
const acmeId = generateId();
const acmeOwner = generateId();

const acme = transactor.forTenant(acmeId).forActor(acmeOwner);
const acmeJob = transactor.forTenant(acmeId);
const me = transactor.forActor(acmeOwner);

await acme.run(OnboardingServiceToken, (onboarding) =>
	onboarding.onboard(acmeOwner, "Acme", "acme", "owner@acme.dev"),
);
await acme.run(ProjectServiceToken, (service) => service.create("Web", "web"));
await acmeJob.run(ProjectServiceToken, (service) => service.create("Nightly", "nightly"));
await me.run(ProfileServiceToken, (profile) => profile.changePassword("rotated"));
```

El contexto aparece **una sola vez**, al crear `acme`, `acmeJob` o `me`. A partir de ahí, cada
uno es "la base de datos vista por ese contexto".

¿Por qué los ids del tenant y del dueño se generan **antes** de crearlos? Porque la policy de
`tenants` exige `id = app.tenant_id`: para insertar el tenant ya tienes que estar "dentro" de él.
Y así el usuario que se registra queda como actor de su propio registro.

### 8.5 Lo que imprime

```text
duplicate slug     : slug "web" is already taken   ← ViolationTranslator
savepoints         : [ "api", "docs" ]             ← run anidado, "web" se saltó
cross-tenant (raw) : forbidden 42501               ← WITH CHECK de RLS
acme sees          : [ "web", "api", "docs" ]      ← USING de RLS
globex sees        : [ "web" ]
no tenant (raw)    : []                            ← RLS: cerrado por defecto
no tenant (service): MissingTokenError             ← dockdi: sin tenant no hay repositorio
no actor (profile) : MissingTokenError             ← dockdi: sin actor no hay "mi cuenta"
acme auditrail     :
  owner   tenant.created       {"name":[null,"Acme"],"slug":[null,"acme-…"]}
  owner   user.created         {"name":[null,"Acme"],"email":[null,"owner@acme-….dev"]}
  owner   membership.created   {"role":[null,"owner"],"userId":[null,"…"]}
  owner   project.created      {"name":[null,"Web"],"slug":[null,"web"]}
  owner   project.created      {"name":[null,"api"],"slug":[null,"api"]}
  owner   project.created      {"name":[null,"docs"],"slug":[null,"docs"]}
  owner   project.renamed      {"name":["Web","Website"]}
  system  project.created      {"name":[null,"Nightly"],"slug":[null,"nightly"]}
identity auditrail : 0 rows visible to runner
```

La sección 9 explica las líneas de auditoría.

El caso `cross-tenant (raw)` usa `TxToken` directamente como `entry` para saltarse los
repositorios y escribir un `tenant_id` ajeno a propósito: aun así, RLS lo frena.

```ts
await acme.run(TxToken, (tx) =>
	tx.insert(projects).values({ tenantId: otherTenantId, name: "Intruder", slug: "intruder" }),
);
```

---

## 9. Auditoría: `auditrail` y el `Chronicler`

El plan completo, con el criterio de **qué registrar y qué no**, está en `sample.md`. Aquí va lo
necesario para entender cómo funciona.

### 9.1 La tabla

| Columna | Qué guarda |
| --- | --- |
| `tenant_id` | Dónde pasó. `NULL` = acción de identidad (sin tenant) |
| `actor_id` | Quién lo hizo. `NULL` = el sistema (un job, un cron) |
| `action` | Qué pasó, en pasado: `project.created`, `user.password_changed` |
| `entity` / `entity_id` | Sobre qué: `projects` / el id del proyecto |
| `changes` | Sólo lo que cambió: `{ campo: [antes, después] }` |
| `txid` | La transacción: todo lo que se registró en un mismo `run` comparte `txid` |
| `occurred_at` | Cuándo: la hora de inicio de la transacción |

`auditrail` **no tiene foreign keys**: si un tenant se borrara con `CASCADE`, se llevaría su
auditoría, justo cuando más se necesita.

### 9.2 Las policies

| Operación de `runner` | Resultado |
| --- | --- |
| `INSERT` dentro de un tenant | Sólo con **ese** `tenant_id` |
| `INSERT` sin tenant (identidad) | Sólo con `tenant_id = NULL` |
| `SELECT` | Sólo filas de su tenant. Las de identidad no las ve ningún tenant |
| `UPDATE` / `DELETE` | Sin policy: afectan 0 filas. La auditoría no se puede alterar |

El `INSERT` usa `tenant_id is not distinct from <tenant actual>`: es un `=` que trata `NULL` como
un valor, y es lo que permite registrar acciones de identidad cuando no hay tenant.

### 9.3 El `Chronicler`

```ts
class Chronicler {
	constructor(
		private readonly tx: Executor,
		private readonly context: TransactorContext,
	) {}

	async record(entry: AuditEntry): Promise<void> {
		await this.tx.insert(auditrail).values({
			...entry,
			tenantId: this.context.tenantId,
			actorId: this.context.actorId,
		});
	}

	static diff<T extends object>(before: T, after: Partial<T>): AuditChanges { ... }
	static created(values: object): AuditChanges { ... }
}
```

- **Recibe `TxToken`**: escribe en la **misma transacción** que el cambio. Si el cambio se
  deshace, su auditoría también. Nunca queda auditado algo que no ocurrió.
- **Recibe `ContextToken`**, no `TenantToken`: tiene que funcionar con y sin tenant (sección 5.1).
- **El servicio no puede "mentir"**: sólo dice *qué* pasó; *dónde* y *quién* salen del contexto.
- **`diff`** compara la fila anterior con los campos nuevos y guarda sólo lo que cambió.
  **`created`** arma los `changes` de algo nuevo (`[null, valor]` por campo).

### 9.4 Un cambio con `diff`

```ts
async rename(id: string, name: string): Promise<void> {
	const before = await this.projects.find(id);
	await this.projects.rename(id, name);
	await this.chronicler.record({
		action: "project.renamed",
		entity: "projects",
		entityId: id,
		changes: Chronicler.diff(before, { name }),
	});
}
```

Resultado: `{"name": ["Web", "Website"]}`. Sólo el campo que cambió.

### 9.5 Identidad: sin tenant, sin valores secretos

```ts
class ProfileService {
	constructor(
		private readonly users: UserRepository,
		private readonly chronicler: Chronicler,
		private readonly actorId: string,
	) {}

	async changePassword(passwordHash: string): Promise<void> {
		await this.users.updatePassword(this.actorId, passwordHash);
		await this.chronicler.record({
			action: "user.password_changed",
			entity: "users",
			entityId: this.actorId,
		});
	}
}
```

- Pide `ActorToken`: sólo existe para alguien identificado.
- **No hay `changes`**: se registra *que* cambió la contraseña, nunca el hash.
- Queda con `tenant_id = NULL`. Por eso el ejemplo imprime `identity auditrail : 0 rows visible
  to runner`: la fila existe, pero ningún tenant puede leerla.

### 9.6 Qué muestra el ejemplo

| Línea | Qué demuestra |
| --- | --- |
| No hay `project.created` del `web` duplicado | El `ROLLBACK` del savepoint se llevó también su auditoría |
| `project.renamed` con un solo campo | `Chronicler.diff` guarda sólo lo que cambió |
| `system  project.created` | Un job con tenant y sin actor queda con `actor_id = NULL` |
| `identity auditrail : 0` | La auditoría de identidad se escribe, pero no la lee ningún tenant |

---

## 10. Recetas

### Leer datos de un tenant

```ts
const rows = await transactor.forTenant(tenantId).forActor(userId).run(ProjectServiceToken, (s) => s.list());
```

### Un repositorio nuevo

- Tabla **con** `tenant_id`: inyecta `[TxToken, TenantToken]` y usa `Omit<..., "tenantId">` en
  los inputs.
- Tabla **global** (como `users`): inyecta sólo `[TxToken]`.

### Auditar una operación

Inyecta `ChroniclerToken` en el servicio y llama `record` **después** del cambio, en el mismo
método. Usa `Chronicler.created(...)` para algo nuevo y `Chronicler.diff(before, after)` para un
cambio. Nunca pongas valores secretos en `changes`.

### Varias escrituras atómicas

Ponlas en el mismo servicio y llámalo en un solo `run`. Todo lo que ocurra dentro del callback
comparte la transacción.

### Tolerar un fallo y seguir

Inyecta `TransactorToken` en el servicio y envuelve la operación arriesgada en `this.transactor.run(...)`.

### Traducir errores en la capa HTTP

```ts
try {
	await transactor.forTenant(tenantId).forActor(userId).run(ProjectServiceToken, (s) => s.create(name, slug));
} catch (error) {
	if (error instanceof SlugTakenError) return conflict(error.message);
	if (error instanceof PersistenceError && error.kind === "forbidden") return forbidden();
	if (error instanceof PersistenceError && error.retryable) return serviceUnavailable();
	throw error;
}
```

---

## 11. Errores comunes

| Síntoma | Causa probable |
| --- | --- |
| `MissingTokenError` de `TenantToken` | Llamaste `run` sin `forTenant` y el servicio usa un repositorio con tenant |
| `MissingTokenError` de `ActorToken` | Llamaste `run` sin `forActor` y el servicio opera sobre "mi cuenta" |
| Auditoría con `actor_id = NULL` inesperado | Olvidaste `forActor`: el `run` se registró como "sistema" |
| `forbidden 42501` al auditar | El `Chronicler` no se inyectó con `ContextToken`, o se escribió un `tenant_id` a mano |
| La consulta devuelve `[]` y sabes que hay datos | El id del tenant no es el correcto, o accediste a la `tx` directo sin `forTenant` |
| `forbidden 42501` al insertar | Escribiste un `tenant_id` a mano distinto al de `forTenant`, o `runner` no tiene GRANT (ej. `DELETE`) |
| `aborted 25P02` | Atrapaste un error y seguiste usando la misma `tx`: usa un `run` anidado |
| `TransactionScopeError` | Llamaste `forTenant` o `forActor` con otro valor desde un `Transactor` anidado |
| RLS "no filtra nada" | Te estás conectando como `sampler` o `tenant`, no como `runner` |
| `invalid input syntax for type uuid: ""` | La base no tiene aplicada la migración `tenant-isolation-nullif` |

---

## 12. Pendientes conocidos

- **`runner` sin `DELETE`**: los privilegios por defecto sólo dan `SELECT, INSERT, UPDATE`.
  Cuando se agregue, los borrados se auditan igual que el resto (`project.deleted`).
- **Leer la auditoría de identidad**: las filas con `tenant_id = NULL` no las ve ningún tenant.
  Leerlas sería un panel de administración con otro rol.
- **Intentos fallidos**: se deshacen con la transacción y no quedan en `auditrail`. Registrarlos
  sería un log de seguridad aparte, escrito fuera de la transacción.
- **Login y memberships**: con RLS en `memberships`, `runner` no puede listar a qué tenants
  pertenece un usuario antes de elegir uno. Se resuelve con una segunda policy por `app.user_id`.
