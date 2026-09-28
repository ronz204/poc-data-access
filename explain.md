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

- La oficina **hereda** todo lo que sabe la recepción (cómo construir `CreateProject`, etc.).
- Pero tiene **cosas propias en su escritorio**: la `tx` de esa transacción, el tenant, el
  actor, el contexto y un `Transactor` anidado.
- Cuando alguien en esa oficina pide algo, dockdi **busca primero en el escritorio de la
  oficina** y, si no está, pregunta a la recepción.

```text
container (recepción)
│  sabe construir: DrizzleProjectRepository, CreateProject, ...
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

Con el actor pasa lo mismo: un caso de uso que pide `ActorToken` (como `ChangePassword`, que opera
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

Para que el caso de uso reciba el anidado **sin enterarse**. Mira `CreateAvailableProjects`
(`source/app/projects/create-available-projects.usecase.ts`):

```ts
export class CreateAvailableProjects {
	constructor(private readonly transactor: Transactor) {} // ← inyectado con TransactorToken
}
```

- Si `CreateAvailableProjects` se resuelve **dentro de un `run`**, dockdi le da el `Transactor`
  anidado de la oficina → sus `run` son savepoints.
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

### 6.5 Ejemplo real (`CreateAvailableProjects`)

```ts
async execute(slugs: readonly string[]): Promise<string[]> {
	const created: string[] = [];
	for (const slug of slugs) {
		try {
			await this.transactor.run(CreateProjectToken, (create) =>
				create.execute({ name: slug, slug }),
			);
			created.push(slug);
		} catch (error) {
			if (!(error instanceof ProjectSlugTakenError)) throw error;
		}
	}
	return created;
}
```

Con `["api", "web", "docs"]` y `web` ya existente, devuelve `["api", "docs"]` y la transacción
externa hace `COMMIT` sin problemas.

Fíjate que el `run` anidado resuelve **otro caso de uso** (`CreateProject`) dentro de la oficina
del savepoint: su repositorio y su `Chronicler` reciben la `tx` del savepoint. Por eso, cuando
`web` falla, se deshacen juntos el proyecto y su registro de auditoría. Los casos de uso se
componen sin saber nada de transacciones.

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

Y el repositorio (`source/infra/projects/drizzle-project.repository.ts`) dice "si falla este
constraint, lanza este error **de dominio**":

```ts
async add(project: Project): Promise<void> {
	const row = ProjectMapper.toRow(project.snapshot(), this.tenantId);
	await ViolationTranslator.translate(this.tx.insert(projects).values(row), {
		[ProjectConstraints.slug]: () => new ProjectSlugTakenError(row.slug),
	});
}
```

- Si falla por `projects_tenant_id_slug_key` → `ProjectSlugTakenError`, que vive en
  `@core/projects/project.errors`. Quien llama nunca ve un error de Postgres.
- Si falla por otra cosa → `PersistenceError` (o el error original si no se reconoce).

Usar las constantes en lugar de strings sueltos hace que un error de tipeo lo detecte el
compilador.

> Recuerda la sección 6: si atrapas el error traducido y quieres **seguir usando la misma
> transacción**, la operación tiene que ir dentro de un `run` anidado.

---

## 8. Recorrido por el código

El diseño completo (por qué separar escritura de lectura, tipos base, reglas de dependencia) está
en `safety.md`. Aquí va el mapa para orientarse.

### 8.1 Las capas

```text
source/
├── core/     dominio: entidades, ids, errores y contratos de repositorio. Sin drizzle ni dockdi
├── app/      casos de uso, contratos de lectura (vistas, filtros, queries) y tokens
├── infra/    implementaciones con drizzle: mappers, repositorios, criteria y queries
├── dock.ts   módulos de dockdi: une cada contrato con su implementación
└── env.ts
drizzle/      DAL (Transactor, Chronicler, errores), modelos, policies y migraciones
cmd/          puntos de entrada (sample.boot.ts)
```

| Capa | Puede importar |
| --- | --- |
| `@core` | sólo sí misma (y `uuidv7`) |
| `@app` | `@core`, `@dal`, `dockdi` (para los tokens) |
| `@infra` | `@core`, `@app`, `@dal`, `@db`, drizzle |
| `@dock`, `cmd/` | todo |

### 8.2 Escritura: entidad → repositorio → mapper

Un caso de uso trabaja con **entidades de dominio**, nunca con filas:

```ts
export class CreateProject {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
	) {}

	async execute(input: CreateProjectInput): Promise<ProjectId> {
		const project = Project.create(input.name, input.slug);
		await this.projects.add(project);
		await this.chronicler.record({ action: "project.created", ... });
		return project.id;
	}
}
```

- `Project` (`@core`) valida sus reglas (el nombre no puede estar vacío) y genera su id.
- `ProjectRepository` es una **interfaz** de `@core` con sólo `find`, `add` y `update`.
- `DrizzleProjectRepository` (`@infra`) la implementa: usa `ProjectMapper` para convertir el
  `snapshot()` en fila (`toRow`) y la fila en entidad (`toDomain` → `reconstitute`).
- El tenant lo pone el repositorio desde `TenantToken`: la entidad no sabe que existe.

### 8.3 Lectura: query → criteria → vista

Una lectura no pasa por el dominio. `DrizzleListProjects` (`@infra/projects/queries/`) devuelve
directamente una vista tipada:

```ts
async execute({ filter, sorting, paging }: ListProjectsParams): Promise<Page<ProjectSummary>> {
	const column = ProjectCriteria.sortable[sorting.field];

	const rows = await this.tx
		.select({ id: projects.id, name: projects.name, ..., taskCount: count(tasks.id) })
		.from(projects)
		.leftJoin(tasks, eq(tasks.projectId, projects.id))
		.where(and(ProjectCriteria.where(filter), Paginator.after(projects, projects.id, column, sorting.direction, paging)))
		.groupBy(projects.id)
		.orderBy(...Paginator.order(projects.id, column, sorting.direction))
		.limit(paging.limit + 1);

	return Paginator.page(rows as ProjectSummary[], paging.limit);
}
```

- `ProjectCriteria.where` traduce el `ProjectFilter` tipado a condiciones de drizzle.
- `ProjectCriteria.sortable` sólo mapea los campos de `ProjectSortField`: no se puede ordenar por
  otra cosa.
- `Paginator` implementa el **cursor**: el cursor es el `id` de la última fila, y la condición
  compara el par `(columna de orden, id)` contra el de esa fila. Así funciona con cualquier
  orden, no sólo por fecha.
- Se piden `limit + 1` filas: si llega la extra, hay página siguiente.

### 8.4 El cableado: `source/dock.ts`

```ts
export class Dock {
	static readonly projects: Module = (container) => {
		container.bind(ProjectRepositoryToken).toClass(DrizzleProjectRepository, [TxToken, TenantToken]);
		container.bind(ListProjectsToken).toClass(DrizzleListProjects, [TxToken]);
		container.bind(CreateProjectToken).toClass(CreateProject, [ProjectRepositoryToken, ChroniclerToken]);
		...
	};

	static create(client: postgres.Sql): Transactor {
		const container = new Container();
		const transactor = Transactor.create(container, client);
		container.bind(TransactorToken).toValue(transactor);
		container.load(Dock.dal, Dock.tenants, Dock.users, Dock.memberships, Dock.projects, Dock.auditrail);
		return transactor;
	}
}
```

Un `Module` por área. Es el **único lugar** donde un contrato (`ProjectRepository`) se une con su
implementación (`DrizzleProjectRepository`).

### 8.5 El uso: `cmd/sample.boot.ts`

```ts
const transactor = Dock.create(postgres(env.POSTGRES_RUNNER_URL));

const acme = transactor.forTenant(acmeId).forActor(acmeOwner);
const acmeJob = transactor.forTenant(acmeId);
const me = transactor.forActor(acmeOwner);

await acme.run(OnboardTenantToken, (onboard) => onboard.execute({ name: "Acme", ... }));
const webId = await acme.run(CreateProjectToken, (create) => create.execute({ name: "Web", slug: "web" }));
await acme.run(RenameProjectToken, (rename) => rename.execute(webId, "Website"));
await acmeJob.run(CreateProjectToken, (create) => create.execute({ name: "Nightly", slug: "nightly" }));
await me.run(ChangePasswordToken, (change) => change.execute("rotated"));
```

El ejemplo ya no define ninguna clase: sólo arma contextos y llama casos de uso y queries.

¿Por qué los ids del tenant y del dueño se generan **antes** (`Identity.next<TenantId>()`)?
Porque la policy de `tenants` exige `id = app.tenant_id`: para insertar el tenant ya tienes que
estar "dentro" de él. Y así el usuario que se registra queda como actor de su propio registro.

### 8.6 Lo que imprime

```text
duplicate slug      : project slug "web" is already taken   ← ViolationTranslator → error de dominio
savepoints          : [ "api", "docs" ]                     ← run anidado, "web" se saltó
domain rule         : project name "   " is invalid         ← regla de la entidad Project
cross-tenant (raw)  : forbidden 42501                       ← WITH CHECK de RLS
page 1 (createdAt)  : [ "web", "api" ] next: yes            ← cursor
page 2 (createdAt)  : [ "docs", "nightly" ] next: no
sorted by name      : [ "Nightly", "Website", "api", "docs" ]
by name, page 2     : [ "api", "docs" ]                     ← cursor con orden por nombre
search 'web'        : [ "Website" ]                         ← ProjectCriteria (ilike)
globex sees         : [ "web" ]                             ← USING de RLS
no tenant (raw)     : []                                    ← RLS: cerrado por defecto
no tenant (create)  : MissingTokenError                     ← dockdi: sin tenant no hay repositorio
no actor (password) : MissingTokenError                     ← dockdi: sin actor no hay "mi cuenta"
acme auditrail      :
  owner   tenant.created       {"name":[null,"Acme"],"slug":[null,"acme-…"]}
  owner   user.created         {"name":[null,"Acme Owner"],"email":[null,"owner@acme-….dev"]}
  owner   membership.created   {"role":[null,"owner"],"userId":[null,"…"]}
  owner   project.created      {"name":[null,"Web"],"slug":[null,"web"]}
  owner   project.created      {"name":[null,"api"],"slug":[null,"api"]}
  owner   project.created      {"name":[null,"docs"],"slug":[null,"docs"]}
  owner   project.renamed      {"name":["Web","Website"]}
  system  project.created      {"name":[null,"Nightly"],"slug":[null,"nightly"]}
identity auditrail  : 0 rows visible to runner
```

El caso `cross-tenant (raw)` usa `TxToken` directamente como `entry` para saltarse los casos de
uso y escribir un `tenant_id` ajeno a propósito: aun así, RLS lo frena. El intento de renombrar
con `"   "` no deja auditoría: la regla de la entidad falla antes de tocar la base.

> `sorted by name` pone las mayúsculas primero. La base usa `en_US.utf8`, pero en la imagen
> `postgres:17-alpine` (musl) esa collation ordena por bytes. Si se quiere un orden "humano", se
> ordena por `lower(name)` o se usa una collation ICU.

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

### 9.4 Un cambio con `diff` sobre snapshots

`RenameProject` (`source/app/projects/rename-project.usecase.ts`):

```ts
async execute(id: ProjectId, name: string): Promise<void> {
	const project = await this.projects.find(id);
	const before = project.snapshot();

	project.rename(name);
	await this.projects.update(project);

	await this.chronicler.record({
		action: "project.renamed",
		entity: "projects",
		entityId: id,
		changes: Chronicler.diff(before, project.snapshot()),
	});
}
```

Resultado: `{"name": ["Web", "Website"]}`. Se compara el snapshot de antes con el de después,
así que la auditoría guarda exactamente lo que la regla de dominio cambió, sin decir a mano qué
campos mirar.

### 9.5 Identidad: sin tenant, sin valores secretos

`ChangePassword` (`source/app/users/change-password.usecase.ts`):

```ts
export class ChangePassword {
	constructor(
		private readonly users: UserRepository,
		private readonly chronicler: Chronicler,
		private readonly actorId: string,
	) {}

	async execute(passwordHash: string): Promise<void> {
		const user = await this.users.find(this.actorId as UserId);
		user.changePassword(passwordHash);
		await this.users.update(user);
		await this.chronicler.record({
			action: "user.password_changed",
			entity: "users",
			entityId: user.id,
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
const page = await transactor
	.forTenant(tenantId)
	.forActor(userId)
	.run(ListProjectsToken, (list) =>
		list.execute({
			filter: { search: "web" },
			sorting: { field: "createdAt", direction: "desc" },
			paging: { limit: 20 },
		}),
	);
```

Para la página siguiente, el mismo llamado con `paging: { limit: 20, after: page.next }`.

### Una lectura nueva

**No toques el repositorio.** Crea una query nueva:

1. En `@app/<módulo>`: la vista (`*.views.ts`), los parámetros y la interfaz (`*.queries.ts`),
   y su token (`*.tokens.ts`).
2. En `@infra/<módulo>/queries/`: la clase `Drizzle...` que implementa la interfaz. Reutiliza
   `<Módulo>Criteria` para los filtros y `Paginator` para el cursor.
3. En `source/dock.ts`: `bind(Token).toClass(DrizzleQuery, [TxToken])`.

### Un agregado nuevo

1. `@core/<módulo>`: ids, entidad (`create`, `reconstitute`, reglas, `snapshot`), errores y la
   interfaz del repositorio.
2. `@infra/<módulo>`: el mapper y `Drizzle<Módulo>Repository`.
   - Tabla **con** `tenant_id`: inyecta `[TxToken, TenantToken]`; el mapper recibe el `tenantId`.
   - Tabla **global** (como `users`): inyecta sólo `[TxToken]`.
3. `@app/<módulo>`: los casos de uso y sus tokens.
4. `source/dock.ts`: un `Module` nuevo, agregado a `Dock.create`.

### Auditar una operación

Inyecta `ChroniclerToken` en el caso de uso y llama `record` **después** del cambio. Usa
`Chronicler.created(...)` para algo nuevo y `Chronicler.diff(before.snapshot, after.snapshot)`
para un cambio. Nunca pongas valores secretos en `changes`.

### Varias escrituras atómicas

Ponlas en el mismo caso de uso y llámalo en un solo `run`. Todo lo que ocurra dentro del
callback comparte la transacción.

### Tolerar un fallo y seguir

Inyecta `TransactorToken` en el caso de uso y envuelve la operación arriesgada en
`this.transactor.run(OtroCasoDeUsoToken, ...)`.

### Traducir errores en la capa HTTP

```ts
try {
	await transactor
		.forTenant(tenantId)
		.forActor(userId)
		.run(CreateProjectToken, (create) => create.execute({ name, slug }));
} catch (error) {
	if (error instanceof ProjectSlugTakenError) return conflict(error.message);
	if (error instanceof InvalidProjectNameError) return badRequest(error.message);
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
