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
│    - crea un scope con TxToken, TenantToken y TransactorToken        │
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
| `dal.transactor.ts` | `Transactor`, `TxToken`, `TenantToken`, `TransactorToken`   | El dueño de las transacciones y del tenant, y las "llaves" con las que dockdi entrega la `tx`, el tenant y el `Transactor` |
| `dal.exceptions.ts` | `PersistenceError`, `TransactionScopeError`                 | Errores normalizados                                          |
| `dal.classifier.ts` | `ErrorClassifier`                                           | Convierte errores crudos de Postgres en `PersistenceError`    |
| `dal.translator.ts` | `ViolationTranslator`                                       | Convierte violaciones de constraints en errores de dominio    |

Los tokens viven junto al `Transactor` porque es él quien los llena en cada `run`: así queda
claro quién los provee, y quien los usa los importa todos de un solo lugar:

```ts
import { TenantToken, Transactor, TransactorToken, TxToken } from "@dal/dal.transactor";
```

---

## 4. El `Transactor`, paso a paso

### 4.1 Su estado

```ts
private constructor(
	private readonly container: Container,     // dónde resolver servicios
	private readonly executor: Executor,       // la base (db) o una transacción (tx)
	private readonly tenantId: string | null,  // tenant a fijar, o ninguno
	private readonly nested: boolean,          // ¿vivo dentro de una transacción abierta?
	private readonly client: postgres.Sql | null, // el pool; sólo el principal lo tiene
) {}
```

Todo es `readonly`: **un `Transactor` nunca cambia**. Si necesitas uno distinto, se crea otro.
El constructor es privado, así que sólo hay dos puertas de entrada: `create` y `forTenant`.

### 4.2 `Transactor.create(container, client)`

Crea el `Transactor` **principal**: sin tenant, no anidado, dueño del pool.
Se crea una sola vez al arrancar la app.

```ts
const transactor = Transactor.create(container, postgres(env.POSTGRES_RUNNER_URL));
```

### 4.3 `forTenant(id)`: una copia, no una modificación

```ts
forTenant(tenantId: string): Transactor {
	return new Transactor(this.container, this.executor, tenantId, this.nested, null);
}
```

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
await transactor.forTenant(acme).run(ProjectServiceToken, (service) => service.list());
```

Paso a paso:

1. **Abre una transacción** con `executor.transaction(...)` → `BEGIN`.
2. **Crea un scope de dockdi** (una "oficina temporal", ver sección 5).
3. **Fija el tenant** (si hay y no es anidado), en dos lugares:
   - En Postgres: `select set_config('app.tenant_id', 'acme', true)`. El `true` final significa
     "sólo durante esta transacción": al hacer `COMMIT` o `ROLLBACK` desaparece.
   - En el scope: `TenantToken` → `'acme'`, para que los repositorios sepan qué `tenant_id`
     escribir sin que nadie se lo pase a mano.
4. **Deja en el scope** además:
   - `TxToken` → la `tx` de esta transacción.
   - `TransactorToken` → un `Transactor` anidado atado a esta `tx` (ver sección 6).
5. **Resuelve `entry`** (tu servicio) dentro de ese scope. dockdi construye el servicio y sus
   repositorios, inyectándoles esa `tx` y ese tenant.
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
- Pero tiene **cosas propias en su escritorio**: la `tx` de esa transacción, el tenant y un
  `Transactor` anidado.
- Cuando alguien en esa oficina pide algo, dockdi **busca primero en el escritorio de la
  oficina** y, si no está, pregunta a la recepción.

```text
container (recepción)
│  sabe construir: TenantRepository, ProjectService, ...
│  TransactorToken → Transactor principal
│
└─ scope del run  (oficina temporal)
   │  TenantToken     → 'acme'
   │  TxToken         → tx
   │  TransactorToken → Transactor anidado     ← gana sobre el de la recepción
   │
   └─ scope del run anidado  (oficina dentro de la oficina)
         TxToken         → savepoint
         TransactorToken → otro Transactor anidado
         (TenantToken no se repite: lo hereda de la oficina de afuera)
```

Por eso un repositorio declarado así:

```ts
container.bind(ProjectRepositoryToken).toClass(ProjectRepository, [TxToken, TenantToken]);
```

recibe **siempre la `tx` y el tenant correctos** sin que nadie se los pase a mano: los busca en
su oficina.

### 5.1 ¿Y si no hay tenant?

Si llamas `transactor.run(...)` sin `forTenant`, el scope **no tiene `TenantToken`**. Cualquier
servicio que dependa (aunque sea indirectamente) de un repositorio con tenant falla al
resolverse con `MissingTokenError`, **antes de ejecutar una sola query**.

Son dos capas de protección:

| Capa | Sin tenant |
| --- | --- |
| App (dockdi) | `MissingTokenError`: el repositorio ni siquiera se construye |
| Base (RLS) | aunque accedas a la `tx` directo, ves `[]` y no puedes escribir |

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
| Fija el tenant | sí | no hace falta: ya está fijado y dura toda la transacción |
| `forTenant(otro)` | permitido (crea otra copia) | **`TransactionScopeError`** |

¿Por qué el anidado no puede cambiar de tenant? Porque `set_config(..., true)` vale para **toda**
la transacción. Si el savepoint lo cambiara, el código de afuera seguiría corriendo con el
tenant equivocado después.

### 6.4 ¿Por qué `run` registra un `Transactor` nuevo en el scope?

Para que el servicio reciba el anidado **sin enterarse**. Mira `ProjectService`:

```ts
class ProjectService {
	constructor(
		private readonly projects: ProjectRepository,
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
			await this.transactor.run(ProjectRepositoryToken, (projects) =>
				projects.create({ name: slug, slug }),
			);
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

	async create(project: Omit<typeof projects.$inferInsert, "tenantId">): Promise<void> {
		await ViolationTranslator.translate(
			this.tx.insert(projects).values({ ...project, tenantId: this.tenantId }),
			{ [ProjectConstraints.slug]: () => new SlugTakenError(project.slug) },
		);
	}

	list() {
		return this.tx.select({ slug: projects.slug, name: projects.name }).from(projects);
	}
}
```

- `Omit<..., "tenantId">` hace que el compilador **no te deje** pasar un `tenantId` a mano.
- `list()` **no filtra por tenant**. RLS lo hace.
- `UserRepository` sólo recibe la `tx`: `users` es global y no tiene tenant.

### 8.2 Servicios: sólo lógica

```ts
class OnboardingService {
	constructor(
		private readonly tenants: TenantRepository,
		private readonly users: UserRepository,
		private readonly memberships: MembershipRepository,
	) {}

	async onboard(name: string, slug: string, ownerEmail: string): Promise<void> {
		const userId = generateId();
		await this.tenants.create({ name, slug });
		await this.users.create({ id: userId, email: ownerEmail, name, passwordHash: "sample" });
		await this.memberships.create({ userId, role: "owner" });
	}
}
```

Los servicios **no mencionan el tenant en ningún lado**. Los tres inserts van en la misma
transacción porque los tres repositorios recibieron la misma `tx` de la misma oficina: si falla
el tercero, se deshacen los tres.

### 8.3 El cableado (una sola vez, al arrancar)

```ts
const container = new Container();
const transactor = Transactor.create(container, postgres(env.POSTGRES_RUNNER_URL));

container.bind(TransactorToken).toValue(transactor);
container.bind(UserRepositoryToken).toClass(UserRepository, [TxToken]);
container.bind(ProjectRepositoryToken).toClass(ProjectRepository, [TxToken, TenantToken]);
container.bind(ProjectServiceToken).toClass(ProjectService, [ProjectRepositoryToken, TransactorToken]);
```

Aquí no existe ninguna `tx` ni ningún tenant todavía. `TxToken` y `TenantToken` sólo se llenan
dentro de cada `run`.

### 8.4 Un `Transactor` por tenant

```ts
const acme = transactor.forTenant(generateId());
const globex = transactor.forTenant(generateId());

await acme.run(OnboardingServiceToken, (onboarding) =>
	onboarding.onboard("Acme", "acme", "owner@acme.dev"),
);
await acme.run(ProjectServiceToken, (service) => service.create("Web", "web"));
```

El tenant aparece **una sola vez**, en `forTenant`. A partir de ahí, `acme` es "la base de datos
vista por Acme".

¿Por qué el id del tenant se genera **antes** de crearlo? Porque la policy de `tenants` exige
`id = app.tenant_id`. Para poder insertar el tenant, ya tienes que estar "dentro" de él.

### 8.5 Lo que imprime

```text
duplicate slug     : slug "web" is already taken   ← ViolationTranslator
savepoints         : [ "api", "docs" ]             ← run anidado, "web" se saltó
cross-tenant (raw) : forbidden 42501               ← WITH CHECK de RLS
acme sees          : [ "web", "api", "docs" ]      ← USING de RLS
globex sees        : [ "web" ]
no tenant (raw)    : []                            ← RLS: cerrado por defecto
no tenant (service): MissingTokenError             ← dockdi: sin tenant no hay repositorio
```

El caso `cross-tenant (raw)` usa `TxToken` directamente como `entry` para saltarse los
repositorios y escribir un `tenant_id` ajeno a propósito: aun así, RLS lo frena.

```ts
await acme.run(TxToken, (tx) =>
	tx.insert(projects).values({ tenantId: otherTenantId, name: "Intruder", slug: "intruder" }),
);
```

---

## 9. Recetas

### Leer datos de un tenant

```ts
const rows = await transactor.forTenant(tenantId).run(ProjectServiceToken, (s) => s.list());
```

### Un repositorio nuevo

- Tabla **con** `tenant_id`: inyecta `[TxToken, TenantToken]` y usa `Omit<..., "tenantId">` en
  los inputs.
- Tabla **global** (como `users`): inyecta sólo `[TxToken]`.

### Varias escrituras atómicas

Ponlas en el mismo servicio y llámalo en un solo `run`. Todo lo que ocurra dentro del callback
comparte la transacción.

### Tolerar un fallo y seguir

Inyecta `TransactorToken` en el servicio y envuelve la operación arriesgada en `this.transactor.run(...)`.

### Traducir errores en la capa HTTP

```ts
try {
	await transactor.forTenant(tenantId).run(ProjectServiceToken, (s) => s.create(name, slug));
} catch (error) {
	if (error instanceof SlugTakenError) return conflict(error.message);
	if (error instanceof PersistenceError && error.kind === "forbidden") return forbidden();
	if (error instanceof PersistenceError && error.retryable) return serviceUnavailable();
	throw error;
}
```

---

## 10. Errores comunes

| Síntoma | Causa probable |
| --- | --- |
| `MissingTokenError` de `TenantToken` | Llamaste `run` sin `forTenant` y el servicio usa un repositorio con tenant |
| La consulta devuelve `[]` y sabes que hay datos | El id del tenant no es el correcto, o accediste a la `tx` directo sin `forTenant` |
| `forbidden 42501` al insertar | Escribiste un `tenant_id` a mano distinto al de `forTenant`, o `runner` no tiene GRANT (ej. `DELETE`) |
| `aborted 25P02` | Atrapaste un error y seguiste usando la misma `tx`: usa un `run` anidado |
| `TransactionScopeError` | Llamaste `forTenant` con otro tenant desde un `Transactor` anidado |
| RLS "no filtra nada" | Te estás conectando como `sampler` o `tenant`, no como `runner` |
| `invalid input syntax for type uuid: ""` | La base no tiene aplicada la migración `tenant-isolation-nullif` |

---

## 11. Pendientes conocidos

- **`runner` sin `DELETE`**: los privilegios por defecto sólo dan `SELECT, INSERT, UPDATE`.
- **Login y memberships**: con RLS en `memberships`, `runner` no puede listar a qué tenants
  pertenece un usuario antes de elegir uno. Se resuelve con una segunda policy por `app.user_id`.
