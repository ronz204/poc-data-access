# Plan de implementación: `auditrail`

Plan para agregar una auditoría **desde la aplicación** (sin triggers). Incluye cómo quedaría el
código, cómo se usaría y, antes que nada, **qué debería registrarse y qué no**.

> **Estado: implementado.** Las decisiones tomadas están en la sección 8 y el código real vive en
> `drizzle/dal/dal.transactor.ts`, `drizzle/dal/dal.chronicler.ts`,
> `drizzle/database/models/auditrail.model.ts`, `drizzle/database/policies/auditrail.policy.ts`
> y `cmd/sample.boot.ts`.

---

## 1. ¿Qué debería registrarse?

La pregunta guía para cada operación:

> **"Si mañana alguien pregunta *¿quién hizo esto y cuándo?*, ¿necesito poder responderle?"**

Si la respuesta es sí, se registra. Si nadie lo va a preguntar nunca, es ruido.

### 1.1 Sí se registra

| Categoría | Ejemplos de `action` | Por qué |
| --- | --- | --- |
| **Permisos y accesos** | `membership.created`, `membership.role_changed`, `membership.removed` | Es lo primero que se investiga en un incidente: quién le dio acceso a quién |
| **Ciclo de vida del tenant** | `tenant.created`, `tenant.plan_changed`, `tenant.suspended` | Afecta a todos los usuarios del tenant y, muchas veces, a la facturación |
| **Identidad** | `user.created`, `user.email_changed`, `user.password_changed` | Cambios de cuenta son la base de un robo de cuenta |
| **Datos de negocio** | `project.created`, `project.renamed`, `project.deleted` | Resuelve disputas: "¿quién borró el proyecto?" |
| **Salida de datos** | `tenant.data_exported` | Una exportación masiva es una lectura, pero una sensible |
| **Acciones de soporte** | `support.impersonated` | Alguien de tu equipo actuando dentro de un tenant ajeno |

### 1.2 No se registra

| Qué | Por qué |
| --- | --- |
| **Lecturas normales** (`list`, `find`) | Volumen enorme, casi nunca se consultan. La excepción son las exportaciones |
| **Valores secretos** (`password_hash`, tokens) | La auditoría no puede convertirse en una fuga. Se registra *que* cambió, no *a qué* |
| **Campos técnicos** (`created_at`, ids generados, contadores) | No aportan a la pregunta "quién hizo qué" |
| **Operaciones fallidas** | La transacción hace `ROLLBACK` y la fila de auditoría se va con ella. Si algún día se necesita, es un "log de seguridad" aparte |
| **La fila completa** en cada cambio | Basta con los campos que cambiaron (un *diff*) |

### 1.3 Convención para `action`

`<entidad>.<verbo en pasado>`, en inglés y `snake_case`:

```text
project.created      project.renamed      project.deleted
membership.created   membership.role_changed
user.password_changed
```

Nombres en pasado porque la auditoría describe **hechos que ya ocurrieron**.

### 1.4 Tenant e identidad

| Operación | `tenant_id` | `actor_id` |
| --- | --- | --- |
| Crear un proyecto en Acme | acme | usuario |
| El usuario cambia su contraseña (`users` es global) | `NULL` | usuario |
| Registro de un tenant nuevo | acme | el usuario que se registra |

`tenant_id = NULL` significa "acción de identidad", no "dato incompleto".

---

## 2. Qué cambia, a vista de pájaro

```text
drizzle/
├── dal/
│   ├── dal.transactor.ts      ← contexto (tenant + actor), forActor, ActorToken, ContextToken
│   └── dal.chronicler.ts      ← NUEVO: Chronicler, ChroniclerToken
└── database/
    ├── models/
    │   └── auditrail.model.ts ← NUEVO: tabla core.auditrail
    └── policies/
        └── auditrail.policy.ts ← NUEVO: sólo agregar y leer lo propio
```

| Paso | Qué | Toca la base |
| --- | --- | --- |
| 1 | `Transactor` con contexto (tenant + actor) | no |
| 2 | Modelo `auditrail` + policies | sí, una migración |
| 3 | `Chronicler`: el que escribe en `auditrail` | no |
| 4 | Usarlo en `cmd/sample.boot.ts` | no |
| 5 | Actualizar `explain.md` | no |

---

## 3. Paso 1: el `Transactor` aprende quién ejecuta

### 3.1 El problema

Hoy el `Transactor` sabe **en qué tenant** se trabaja, pero no **quién** trabaja. Sumarle un
parámetro más al constructor lo dejaría con 6 posicionales. Mejor agrupar ambos datos en un
**contexto**.

### 3.2 Código propuesto

```ts
export interface TransactorContext {
	readonly tenantId: string | null;
	readonly actorId: string | null;
}

export const TxToken = token<Executor>("Tx");
export const TenantToken = token<string>("Tenant");
export const ActorToken = token<string>("Actor");
export const ContextToken = token<TransactorContext>("Context");
export const TransactorToken = token<Transactor>("Transactor");

export class Transactor {
	private constructor(
		private readonly container: Container,
		private readonly executor: Executor,
		private readonly context: TransactorContext,
		private readonly nested: boolean,
		private readonly client: postgres.Sql | null,
	) {}

	static create(container: Container, client: postgres.Sql): Transactor {
		const context = { tenantId: null, actorId: null };
		return new Transactor(container, drizzle({ client }), context, false, client);
	}

	forTenant(tenantId: string): Transactor {
		return this.with({ tenantId });
	}

	forActor(actorId: string): Transactor {
		return this.with({ actorId });
	}

	async run<S, R>(entry: Token<S>, work: (service: S) => Promise<R>): Promise<R> {
		try {
			return await this.executor.transaction(async (tx) => {
				const scope = this.container.scope();

				if (!this.nested) {
					const { tenantId, actorId } = this.context;
					if (tenantId) {
						await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
						scope.bind(TenantToken).toValue(tenantId);
					}
					if (actorId) scope.bind(ActorToken).toValue(actorId);
					scope.bind(ContextToken).toValue(this.context);
				}

				scope.bind(TxToken).toValue(tx);
				scope.bind(TransactorToken).toValue(new Transactor(scope, tx, this.context, true, null));
				return work(scope.resolve(entry));
			});
		} catch (error) {
			throw ErrorClassifier.normalize(error);
		}
	}

	async close(): Promise<void> {
		await this.client?.end();
	}

	private with(patch: Partial<TransactorContext>): Transactor {
		const context = { ...this.context, ...patch };
		const switched =
			context.tenantId !== this.context.tenantId || context.actorId !== this.context.actorId;
		if (this.nested && switched) {
			throw new TransactionScopeError("a nested run cannot switch context");
		}
		return new Transactor(this.container, this.executor, context, this.nested, null);
	}
}
```

### 3.3 Qué cambió y por qué

| Cambio | Motivo |
| --- | --- |
| `tenantId` pasa a `context` | Un solo objeto en vez de parámetros sueltos; agregar algo más (ej. `requestId`) no toca la firma |
| `forActor` | Igual que `forTenant`: devuelve una **copia**, nunca modifica |
| `with` privado | `forTenant` y `forActor` comparten la regla del anidado en un solo lugar |
| `ActorToken` | Como `TenantToken`: sólo existe si hay actor. Un servicio que lo exija falla con `MissingTokenError` si nadie ejecuta |
| `ContextToken` | Existe **siempre**, con `null` donde no hay dato. Lo necesita el `Chronicler`, que debe funcionar tanto en tenant como en identidad |
| Sin `set_config` para el actor | Sin triggers, la base no necesita saber quién es el actor. Se agregaría el día que haya triggers |

Los tokens de tenant, actor y contexto se registran sólo en la transacción principal; los `run`
anidados los **heredan** del scope de afuera.

### 3.4 Cómo se usa

```ts
await transactor.forTenant(acme).forActor(userId).run(ProjectServiceToken, (s) => s.create("Web", "web"));

await transactor.forActor(userId).run(ProfileServiceToken, (s) => s.changePassword(next));

await transactor.forTenant(acme).run(ProjectServiceToken, (s) => s.list());
```

| Llamada | Tenant | Actor | Caso |
| --- | --- | --- | --- |
| `forTenant(t).forActor(u)` | ✅ | ✅ | Un usuario trabajando dentro de su tenant |
| `forActor(u)` | ❌ | ✅ | Un usuario sobre su propia cuenta (identidad) |
| `forTenant(t)` | ✅ | ❌ | Procesos del sistema: jobs, crons. Quedan con `actor_id = NULL` |
| _(ninguno)_ | ❌ | ❌ | Antes de identificar a alguien, por ejemplo un login |

---

## 4. Paso 2: la tabla `auditrail`

### 4.1 Modelo

```ts
export type AuditChanges = Record<string, readonly [before: unknown, after: unknown]>;

export const auditrail = core.table(
	"auditrail",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		tenantId: uuid("tenant_id"),
		actorId: uuid("actor_id"),
		action: text("action").notNull(),
		entity: text("entity").notNull(),
		entityId: uuid("entity_id"),
		changes: jsonb("changes").$type<AuditChanges>(),
		txid: bigint("txid", { mode: "number" }).notNull().default(sql`txid_current()`),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("auditrail_tenant_id_occurred_at_idx").on(t.tenantId, t.occurredAt),
		index("auditrail_actor_id_occurred_at_idx").on(t.actorId, t.occurredAt),
		index("auditrail_entity_entity_id_idx").on(t.entity, t.entityId),
		...AuditrailPolicy.appendOnly(t.tenantId),
	],
);
```

### 4.2 Decisiones de diseño

| Decisión | Motivo |
| --- | --- |
| **Sin foreign keys** a `tenants` ni `users` | Con `ON DELETE CASCADE`, borrar un tenant **borraría su auditoría**, justo cuando más se necesita. La auditoría debe sobrevivir a lo que audita |
| `tenant_id` y `actor_id` nullable | Identidad sin tenant, sistema sin actor (sección 1.4) |
| `entity_id` nullable | Hay entidades sin id propio, como `memberships` (PK compuesta); ahí el detalle va en `changes` |
| `changes` como diff `{ campo: [antes, después] }` | Sólo lo que cambió; en un `created` el "antes" es `null` |
| `txid` con `txid_current()` | Todas las filas de un mismo `run` comparten `txid`: se puede reconstruir "qué pasó en esta operación" |
| `occurred_at` con `now()` | En Postgres `now()` es la hora de **inicio de la transacción**: todo un `run` queda con la misma hora, lo cual es coherente con `txid` |
| Índices por tenant, actor y entidad | Las tres preguntas típicas: "¿qué pasó en este tenant?", "¿qué hizo esta persona?", "¿qué le pasó a este proyecto?" |

### 4.3 Policies: sólo agregar, sólo leer lo propio

```ts
export class AuditrailPolicy {
	static appendOnly(tenantId: AnyPgColumn) {
		const current = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

		return [
			pgPolicy("auditrail_insert", {
				as: "permissive",
				for: "insert",
				to: runner,
				withCheck: sql`${tenantId} is not distinct from ${current}`,
			}),
			pgPolicy("auditrail_select", {
				as: "permissive",
				for: "select",
				to: runner,
				using: sql`${tenantId} = ${current}`,
			}),
		];
	}
}
```

| Operación de `runner` | Resultado |
| --- | --- |
| `INSERT` dentro de un tenant | Sólo con **ese** `tenant_id` |
| `INSERT` sin tenant (identidad) | Sólo con `tenant_id = NULL` |
| `SELECT` | Sólo filas de su tenant. Las de identidad (`NULL`) no las ve ningún tenant |
| `UPDATE` / `DELETE` | Ninguna policy lo permite: afecta 0 filas. La auditoría no se puede alterar |

`is not distinct from` es el `=` que trata `NULL` como un valor: `NULL is not distinct from NULL`
es verdadero, mientras que `NULL = NULL` no lo es. Eso es lo que permite escribir auditoría de
identidad cuando no hay tenant.

Los privilegios por defecto le dan `UPDATE` a `runner`, pero no hace falta un `REVOKE`: sin una
policy de `UPDATE`, RLS lo reduce a 0 filas afectadas.

### 4.4 Migración

Se genera normal, sin triggers:

```bash
bunx --bun drizzle-kit generate --name auditrail
bun run drizz:migrate
```

---

## 5. Paso 3: el `Chronicler`

El componente que escribe en `auditrail`. Mismo largo de nombre que el resto de la DAL
(`dal.chronicler.ts`, 10 letras), y describe lo que hace: lleva la crónica de lo que ocurre.

### 5.1 Código propuesto

```ts
export interface AuditEntry {
	readonly action: string;
	readonly entity: string;
	readonly entityId?: string | null;
	readonly changes?: AuditChanges | null;
}

export const ChroniclerToken = token<Chronicler>("Chronicler");

export class Chronicler {
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

	static diff<T extends object>(before: T, after: Partial<T>): AuditChanges {
		const changes: Record<string, readonly [unknown, unknown]> = {};
		for (const [field, value] of Object.entries(after)) {
			const previous = before[field as keyof T];
			if (previous !== value) changes[field] = [previous, value];
		}
		return changes;
	}

	static created(values: object): AuditChanges {
		return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, [null, value]]));
	}
}
```

### 5.2 Por qué así

| Detalle | Motivo |
| --- | --- |
| Recibe `TxToken` | Escribe **en la misma transacción** que el cambio: si el cambio se deshace, su auditoría también. Nunca queda auditado algo que no ocurrió |
| Recibe `ContextToken` (no `TenantToken`) | Funciona en tenant **y** en identidad. Con `TenantToken` fallaría al auditar un cambio de contraseña |
| `tenantId` y `actorId` salen del contexto | El servicio no puede "mentir" sobre quién o dónde; sólo dice **qué** pasó |
| `diff` y `created` estáticos | Ayudan a armar `changes` sin repetir código en cada servicio |

### 5.3 Cableado

```ts
container.bind(ChroniclerToken).toClass(Chronicler, [TxToken, ContextToken]);
```

---

## 6. Paso 4: cómo se usa

### 6.1 Un servicio de negocio

El repositorio pasa a devolver lo que el servicio necesita para auditar (el `id`, o la fila
anterior en un cambio). El `id` se genera en la app, igual que el de los tenants, así no hace
falta `returning()`:

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

	async find(id: string) {
		const [row] = await this.tx.select().from(projects).where(eq(projects.id, id));
		if (!row) throw new ProjectNotFoundError(id);
		return row;
	}

	async rename(id: string, name: string): Promise<void> {
		await this.tx.update(projects).set({ name }).where(eq(projects.id, id));
	}
}

class ProjectService {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
	) {}

	async create(name: string, slug: string): Promise<string> {
		const id = await this.projects.create({ name, slug });
		await this.chronicler.record({
			action: "project.created",
			entity: "projects",
			entityId: id,
			changes: Chronicler.created({ name, slug }),
		});
		return id;
	}

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
}
```

Filas resultantes:

| action | tenant_id | actor_id | entity_id | changes |
| --- | --- | --- | --- | --- |
| `project.created` | acme | u1 | p1 | `{"name": [null, "Web"], "slug": [null, "web"]}` |
| `project.renamed` | acme | u1 | p1 | `{"name": ["Web", "Website"]}` |

### 6.2 Un servicio de identidad (sin tenant)

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

container
	.bind(ProfileServiceToken)
	.toClass(ProfileService, [UserRepositoryToken, ChroniclerToken, ActorToken]);

await transactor.forActor(userId).run(ProfileServiceToken, (s) => s.changePassword(hash));
```

- `ProfileService` exige `ActorToken`: sin actor, ni siquiera se construye.
- No hay `changes`: se registra **que** la contraseña cambió, nunca el hash (sección 1.2).
- Queda con `tenant_id = NULL`, y la policy de inserción lo permite porque no hay tenant fijado.

### 6.3 Registro de un tenant nuevo

Mismo truco que con el tenant: los ids se generan **antes**, así el nuevo usuario ya es el actor
de su propio registro.

```ts
const tenantId = generateId();
const userId = generateId();

await transactor
	.forTenant(tenantId)
	.forActor(userId)
	.run(OnboardingServiceToken, (s) => s.onboard(userId, "Acme", "acme", "owner@acme.dev"));
```

Dentro, `OnboardingService` registra tres hechos, todos con el mismo `txid`:

```text
tenant.created       tenant_id=acme  actor_id=u1
user.created         tenant_id=acme  actor_id=u1
membership.created   tenant_id=acme  actor_id=u1  changes={"role": [null, "owner"]}
```

### 6.4 Consultar la auditoría del tenant

```ts
class AuditrailRepository {
	constructor(private readonly tx: Executor) {}

	recent(limit: number) {
		return this.tx.select().from(auditrail).orderBy(desc(auditrail.occurredAt)).limit(limit);
	}
}

await transactor.forTenant(acme).run(AuditrailRepositoryToken, (r) => r.recent(50));
```

Sin `WHERE tenant_id`: RLS devuelve sólo lo de Acme.

### 6.5 Savepoints y auditoría

Un `run` anidado que falla se lleva su auditoría con él, porque todo va en la misma transacción.
Así se ve `createAvailable(["api", "web", "docs"])`, que hace un `run` anidado por cada slug:

```text
BEGIN
  SAVEPOINT
    INSERT projects 'api'   + INSERT auditrail project.created api    ✅
  RELEASE SAVEPOINT
  SAVEPOINT
    INSERT projects 'web'   💥 unique
  ROLLBACK TO SAVEPOINT                                               ← sin auditoría de 'web'
  SAVEPOINT
    INSERT projects 'docs'  + INSERT auditrail project.created docs   ✅
  RELEASE SAVEPOINT
COMMIT
```

Así la auditoría siempre refleja exactamente lo que quedó en la base. Y como todo ocurre en la
misma transacción, las filas de `api` y `docs` comparten el mismo `txid`.

---

## 7. Lo que queda fuera (a propósito)

| Tema | Por qué no ahora |
| --- | --- |
| Triggers | La auditoría desde la app registra **intenciones de negocio** (`project.renamed`), que un trigger no conoce. Los triggers serían una segunda red para accesos que se saltan los servicios |
| Log de intentos fallidos | Requiere escribir fuera de la transacción (otra conexión). Es un problema distinto: seguridad, no auditoría |
| Lectura de auditoría de identidad | Las filas con `tenant_id = NULL` no las ve ningún tenant. Leerlas sería un panel de administración con otro rol |
| Retención y particionado | Cuando el volumen lo pida: particionar `auditrail` por mes y archivar lo viejo |

---

## 8. Decisiones tomadas

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Nombre del componente | `Chronicler` |
| 2 | `REVOKE UPDATE` sobre `auditrail` | No: RLS basta |
| 3 | Formato de `changes` | `{ campo: [antes, después] }` |
| 4 | Actor obligatorio en tenant | No. Un tenant puede ir sin actor (jobs, crons) y un actor puede ir sin tenant (login, cuenta propia) |

---

## 9. Resultado en `cmd/sample.boot.ts`

```text
duplicate slug     : slug "web" is already taken
savepoints         : [ "api", "docs" ]
cross-tenant (raw) : forbidden 42501
acme sees          : [ "web", "api", "docs" ]
globex sees        : [ "web" ]
no tenant (raw)    : []
no tenant (service): MissingTokenError
no actor (profile) : MissingTokenError
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

| Línea | Qué demuestra |
| --- | --- |
| Sin `project.created` para `web` duplicado | El `ROLLBACK` se llevó también su auditoría |
| `project.renamed` con un solo campo | `Chronicler.diff` guarda sólo lo que cambió |
| `system  project.created` | Un job con tenant y sin actor queda con `actor_id = NULL` |
| `no actor (profile)` | `ProfileService` exige `ActorToken`: sin actor no se construye |
| `identity auditrail : 0` | El cambio de contraseña **sí** se registró (`tenant_id = NULL`), pero ningún tenant puede leerlo |
