# Acceso a datos con tipos seguros

Análisis y propuesta para que el acceso a datos **crezca sin convertirse en una clase gigante**,
con parámetros, filtros, orden y paginación tipados, y con una frontera clara entre persistencia
y dominio.

> **Estado: implementado** en `source/core`, `source/app`, `source/infra` y `source/dock.ts`,
> con `cmd/sample.boot.ts` como ejemplo. La sección 11 lista lo que cambió respecto de la
> propuesta original al implementarlo.

---

## 1. Diagnóstico

### 1.1 Cómo crece un repositorio "normal"

Hoy `ProjectRepository` tiene `create`, `find`, `rename` y `list`. Eso está bien. El problema
aparece con el tiempo, porque **cada pantalla nueva pide una consulta nueva**:

```text
ProjectRepository
  create, find, rename, list
  findBySlug
  listByOwner
  listActive
  listActiveWithTaskCount
  searchByName
  searchByNamePaginated
  listCreatedBetween
  countByStatus
  ...
```

Síntomas conocidos:

| Síntoma | Consecuencia |
| --- | --- |
| Un método por combinación de filtros | Explosión combinatoria: `listActiveByOwnerSortedByName...` |
| Métodos que devuelven la fila de drizzle | El resto de la app queda acoplado al esquema de la base |
| Métodos de lectura mezclados con los de escritura | La misma clase sirve a dos necesidades que evolucionan distinto |
| Filtros como parámetros sueltos (`list(name?, from?, to?, page?)`) | Fácil pasar argumentos en el orden equivocado |
| Todos los ids son `string` | Nada impide pasar un `userId` donde se espera un `projectId` |

### 1.2 Lo que ya está bien y se conserva

- `Transactor`, contexto, RLS y `Chronicler`: **no cambian**.
- `ViolationTranslator` y los `*Constraints` de los modelos: siguen siendo la forma de traducir
  errores.
- `reconstitute` / `snapshot` para cruzar entre persistencia y dominio: es la base de la
  propuesta.

---

## 2. La idea central: separar escribir de leer

La escritura y la lectura tienen necesidades opuestas:

| | Escritura | Lectura |
| --- | --- | --- |
| Qué maneja | **Entidades de dominio** con reglas (`project.rename(...)`) | **Vistas**: datos planos armados para una pantalla |
| Cuántas formas | Pocas y estables: traer, agregar, guardar | Muchas y cambiantes: una por pantalla o endpoint |
| Joins | Casi nunca | Constantemente (`project` + conteo de `tasks`) |
| Pasa por el dominio | Sí: `reconstitute` → regla → `snapshot` | No hace falta: no hay reglas que proteger |

Por eso la propuesta divide el acceso a datos en **dos piezas distintas**:

```text
                ┌───────────────────────────┐
  Escritura ──► │ Repository  (uno por      │ ──► Mapper ──► Entidad de dominio
                │ agregado, 3-4 métodos,    │     (reconstitute / snapshot)
                │ no crece)                 │
                └───────────────────────────┘

                ┌───────────────────────────┐
  Lectura ────► │ Query  (una clase por     │ ──► Criteria (filtros) ──► Vista tipada
                │ consulta, un archivo      │     Sorting / Paging
                │ cada una)                 │
                └───────────────────────────┘
```

- **El repositorio deja de crecer**: sólo persiste agregados (`find`, `add`, `update`). Nunca
  lista ni busca.
- **Cada consulta nueva es un archivo nuevo**, no un método más. Una clase `Query` pequeña con
  sus parámetros y su resultado tipados.
- **Los filtros compartidos** (por ejemplo "buscar por nombre") viven en una clase `Criteria`
  por entidad, que las queries reutilizan.

Es CQRS en su versión más liviana: misma base, misma transacción, sólo separación de código.

---

## 3. Tipos base

Pocos tipos genéricos que todo el resto reutiliza.

### 3.1 Ids con marca (`Brand`)

Todos los ids son uuid, así que TypeScript no distingue un `userId` de un `projectId`. Una marca
de tipo lo arregla sin costo en tiempo de ejecución:

```ts
declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type ProjectId = Brand<string, "ProjectId">;
```

```ts
function rename(id: ProjectId, name: string) { ... }

rename(userId, "Web");    // ❌ error de compilación
rename(projectId, "Web"); // ✅
```

El único lugar donde un `string` se convierte en `ProjectId` es la frontera: el mapper (al leer
de la base) o la validación de entrada (al recibir un request).

### 3.2 Orden y paginación

```ts
export type Direction = "asc" | "desc";

export interface Sorting<Field extends string> {
	readonly field: Field;
	readonly direction: Direction;
}

export type Cursor = Brand<string, "Cursor">;

export interface Paging {
	readonly limit: number;
	readonly after?: Cursor;
}

export interface Page<Item> {
	readonly items: readonly Item[];
	readonly next: Cursor | null;
}
```

**Paginación por cursor (keyset) en vez de `offset`.** Con `offset 10000` la base igual recorre
las 10 000 filas anteriores; con cursor va directo. Y como los ids son **uuidv7** (ordenados por
tiempo), el propio `id` sirve de cursor para el orden por defecto (más recientes o más antiguos).

### 3.3 Parámetros de una query

Cada query declara **un solo objeto** de parámetros, nunca argumentos sueltos:

```ts
export interface ListProjectsParams {
	readonly filter: ProjectFilter;
	readonly sorting: Sorting<ProjectSortField>;
	readonly paging: Paging;
}
```

Un objeto con nombres no se puede pasar "en el orden equivocado", y agregar un parámetro no
rompe a quien ya lo llama.

---

## 4. Escritura: entidad, mapper y repositorio

### 4.1 La entidad (dominio puro, sin drizzle)

```ts
export interface ProjectSnapshot {
	readonly id: ProjectId;
	readonly name: string;
	readonly slug: string;
	readonly createdAt: Date;
}

export class Project {
	private constructor(private state: ProjectSnapshot) {}

	static create(name: string, slug: string): Project {
		return new Project({ id: generateId() as ProjectId, name, slug, createdAt: new Date() });
	}

	static reconstitute(snapshot: ProjectSnapshot): Project {
		return new Project(snapshot);
	}

	get id(): ProjectId {
		return this.state.id;
	}

	rename(name: string): void {
		if (name.trim().length === 0) throw new InvalidProjectNameError(name);
		this.state = { ...this.state, name };
	}

	snapshot(): ProjectSnapshot {
		return this.state;
	}
}
```

La entidad **no conoce el tenant**. La tenencia es un asunto de infraestructura que ya resuelven
`TenantToken` y RLS; el dominio sólo se ocupa de sus reglas.

### 4.2 El mapper (la única frontera entre fila y dominio)

```ts
type ProjectRow = typeof projects.$inferSelect;
type ProjectInsert = typeof projects.$inferInsert;

export class ProjectMapper {
	static toDomain(row: ProjectRow): Project {
		return Project.reconstitute({
			id: row.id as ProjectId,
			name: row.name,
			slug: row.slug,
			createdAt: row.createdAt,
		});
	}

	static toRow(snapshot: ProjectSnapshot, tenantId: TenantId): ProjectInsert {
		return { ...snapshot, tenantId };
	}
}
```

- `ProjectRow` **nunca sale** de la infraestructura.
- Si mañana una columna cambia de nombre, sólo cambia el mapper.
- Es el único lugar con `as ProjectId`: la conversión de `string` a id con marca queda en un solo
  punto.

### 4.3 El repositorio: un contrato pequeño y fijo

El contrato vive en el dominio; la implementación, en infraestructura; el token, en la
aplicación (así `@core` no depende de `dockdi`).

```ts
export interface ProjectRepository {
	find(id: ProjectId): Promise<Project>;
	add(project: Project): Promise<void>;
	update(project: Project): Promise<void>;
}
```

```ts
export const ProjectRepositoryToken = token<ProjectRepository>("ProjectRepository");
```

```ts
export class DrizzleProjectRepository implements ProjectRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: TenantId,
	) {}

	async find(id: ProjectId): Promise<Project> {
		const [row] = await this.tx.select().from(projects).where(eq(projects.id, id));
		if (!row) throw new ProjectNotFoundError(id);
		return ProjectMapper.toDomain(row);
	}

	async add(project: Project): Promise<void> {
		const row = ProjectMapper.toRow(project.snapshot(), this.tenantId);
		await ViolationTranslator.translate(this.tx.insert(projects).values(row), {
			[ProjectConstraints.slug]: () => new SlugTakenError(row.slug),
		});
	}

	async update(project: Project): Promise<void> {
		const { id, ...changes } = ProjectMapper.toRow(project.snapshot(), this.tenantId);
		await ViolationTranslator.translate(
			this.tx.update(projects).set(changes).where(eq(projects.id, id)),
			{ [ProjectConstraints.slug]: () => new SlugTakenError(changes.slug) },
		);
	}
}
```

**Tres métodos, y así se queda.** Que una pantalla necesite "proyectos activos con su conteo de
tareas" no toca este archivo.

### 4.4 Un caso de uso de escritura

```ts
export class RenameProject {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
	) {}

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
}
```

**`snapshot` + `Chronicler.diff` encajan solos.** Se toma el snapshot antes de la regla, se toma
otro después, y la auditoría guarda exactamente lo que la regla cambió, sin escribir a mano qué
campos mirar.

---

## 5. Lectura: queries, criteria y vistas

### 5.1 La vista: lo que la pantalla necesita, nada más

```ts
export interface ProjectSummary {
	readonly id: ProjectId;
	readonly name: string;
	readonly slug: string;
	readonly taskCount: number;
	readonly createdAt: Date;
}
```

No es la entidad ni la fila: es un **contrato de salida**. Puede combinar tablas (`taskCount`) y
omitir lo que la pantalla no usa.

### 5.2 El filtro y el orden tipados

```ts
export interface ProjectFilter {
	readonly search?: string;
	readonly slugs?: readonly string[];
	readonly createdAfter?: Date;
}

export type ProjectSortField = "name" | "createdAt";
```

- Todos los campos del filtro son **opcionales**: un filtro vacío (`{}`) significa "todos".
- `ProjectSortField` es una unión cerrada: no se puede ordenar por una columna que no se decidió
  exponer, ni por un string que venga crudo de un query param.

### 5.3 `Criteria`: filtros reutilizables

Traduce el filtro tipado a condiciones de drizzle. Es la pieza que evita repetir el mismo `WHERE`
en cada query.

```ts
export class ProjectCriteria {
	static readonly sortable = {
		name: projects.name,
		createdAt: projects.createdAt,
	} satisfies Record<ProjectSortField, AnyPgColumn>;

	static where(filter: ProjectFilter): SQL | undefined {
		return and(
			filter.search ? ilike(projects.name, `%${Criteria.escapeLike(filter.search)}%`) : undefined,
			filter.slugs?.length ? inArray(projects.slug, [...filter.slugs]) : undefined,
			filter.createdAfter ? gt(projects.createdAt, filter.createdAfter) : undefined,
		);
	}
}
```

- `and(...)` de drizzle **ignora los `undefined`**: un filtro vacío produce "sin condición".
- `satisfies Record<ProjectSortField, ...>`: si alguien agrega `"slug"` a `ProjectSortField` y
  olvida mapearlo, **no compila**.
- `Criteria.escapeLike` sería un helper común: sin él, un `%` en la búsqueda del usuario se
  interpretaría como comodín.

### 5.4 La query: una clase, un archivo, una responsabilidad

```ts
export interface ListProjectsParams {
	readonly filter: ProjectFilter;
	readonly sorting: Sorting<ProjectSortField>;
	readonly paging: Paging;
}

export interface ListProjects {
	execute(params: ListProjectsParams): Promise<Page<ProjectSummary>>;
}
```

La interfaz vive en `@app` (así los casos de uso y los tokens no dependen de `@infra`); la
implementación, en `@infra`:

```ts
export class DrizzleListProjects implements ListProjects {
	constructor(private readonly tx: Executor) {}

	async execute({ filter, sorting, paging }: ListProjectsParams): Promise<Page<ProjectSummary>> {
		const column = ProjectCriteria.sortable[sorting.field];

		const rows = await this.tx
			.select({
				id: projects.id,
				name: projects.name,
				slug: projects.slug,
				taskCount: count(tasks.id),
				createdAt: projects.createdAt,
			})
			.from(projects)
			.leftJoin(tasks, eq(tasks.projectId, projects.id))
			.where(
				and(
					ProjectCriteria.where(filter),
					Paginator.after(projects, projects.id, column, sorting.direction, paging),
				),
			)
			.groupBy(projects.id)
			.orderBy(...Paginator.order(projects.id, column, sorting.direction))
			.limit(paging.limit + 1);

		return Paginator.page(rows as ProjectSummary[], paging.limit);
	}
}
```

- **No filtra por tenant**: RLS lo hace, igual que hoy.
- `Paginator.page` pide `limit + 1` filas para saber si hay página siguiente sin hacer un `count`.
- `Paginator.order` ordena por la columna elegida **y luego por `id`**: dos proyectos con el
  mismo nombre siempre salen en el mismo orden, y la paginación no repite ni salta filas.

### 5.5 El cursor funciona con cualquier orden

El cursor es sólo el `id` de la última fila. `Paginator.after` busca el valor de la columna de
orden de esa fila y compara **el par** `(columna, id)`:

```ts
static after(table, key, column, direction, paging): SQL | undefined {
	if (!paging.after) return undefined;

	const pivot = sql`(select ${column} from ${table} where ${key} = ${paging.after})`;
	return direction === "asc"
		? sql`(${column}, ${key}) > (${pivot}, ${paging.after})`
		: sql`(${column}, ${key}) < (${pivot}, ${paging.after})`;
}
```

```sql
where (name, id) > ((select name from projects where id = $cursor), $cursor)
order by name, id
```

Postgres compara tuplas en orden: primero `name`, y si empata, `id`. Por eso el mismo helper sirve
para ordenar por fecha o por nombre, sin un cursor distinto por cada orden. Y como la subconsulta
también pasa por RLS, un cursor de otro tenant simplemente no encuentra su fila.

### 5.6 ¿Y si otra pantalla necesita otra forma de leer proyectos?

Se crea **otra query**, reutilizando `ProjectCriteria`:

```text
projects/queries/
  list-projects.query.ts        → Page<ProjectSummary>
  project-detail.query.ts       → ProjectDetail (con sus tareas)
  project-options.query.ts      → { id, name }[] para un <select>
```

Ninguna toca a las otras, ninguna toca al repositorio.

---

## 6. Cableado y uso

El cableado vive en `source/dock.ts`, con un `Module` de `dockdi` por área:

```ts
export class Dock {
	static readonly projects: Module = (container) => {
		container
			.bind(ProjectRepositoryToken)
			.toClass(DrizzleProjectRepository, [TxToken, TenantToken]);
		container.bind(ListProjectsToken).toClass(DrizzleListProjects, [TxToken]);
		container
			.bind(RenameProjectToken)
			.toClass(RenameProject, [ProjectRepositoryToken, ChroniclerToken]);
	};

	static create(client: postgres.Sql): Transactor { ... }
}
```

```ts
const transactor = Dock.create(postgres(env.POSTGRES_RUNNER_URL));
const acme = transactor.forTenant(tenantId).forActor(userId);

const page = await acme.run(ListProjectsToken, (query) =>
	query.execute({
		filter: { search: "web" },
		sorting: { field: "createdAt", direction: "desc" },
		paging: { limit: 20 },
	}),
);

await acme.run(RenameProjectToken, (useCase) => useCase.execute(page.items[0].id, "Website"));
```

Nada del `Transactor` cambia: tanto las queries como los casos de uso son servicios que
`dockdi` resuelve dentro del `run`, con su `tx` y su contexto.

---

## 7. Dónde vive cada cosa

Organizado **por módulo** (feature) dentro de cada capa. Así quedó el módulo `projects`, que es
el más completo; `tenants`, `users`, `memberships` y `auditrail` siguen el mismo molde con lo
que cada uno necesita:

```text
source/
├── core/                                   ← dominio: sin drizzle, sin dockdi
│   ├── shared/
│   │   ├── brand.type.ts                   Brand
│   │   └── identity.helper.ts              Identity.next()
│   └── projects/
│       ├── project.entity.ts               Project, ProjectSnapshot
│       ├── project.errors.ts               ProjectSlugTakenError, InvalidProjectNameError, ...
│       ├── project.ids.ts                  ProjectId
│       └── project.repository.ts           interface ProjectRepository
│
├── app/                                    ← casos de uso, contratos de lectura y tokens
│   ├── shared/
│   │   └── paging.type.ts                  Sorting, Paging, Page, Cursor
│   └── projects/
│       ├── create-project.usecase.ts
│       ├── rename-project.usecase.ts
│       ├── create-available-projects.usecase.ts
│       ├── project.views.ts                ProjectSummary
│       ├── project.filters.ts              ProjectFilter, ProjectSortField
│       ├── project.queries.ts              ListProjectsParams, interface ListProjects
│       └── project.tokens.ts               ProjectRepositoryToken, CreateProjectToken, ...
│
├── infra/                                  ← implementaciones con drizzle
│   ├── shared/
│   │   ├── criteria.helper.ts              Criteria.escapeLike
│   │   └── paginator.helper.ts             Paginator.after, Paginator.order, Paginator.page
│   └── projects/
│       ├── project.mapper.ts
│       ├── project.criteria.ts
│       ├── drizzle-project.repository.ts
│       └── queries/
│           └── list-projects.query.ts      DrizzleListProjects
│
└── dock.ts                                 ← un Module de dockdi por área + Dock.create
```

`drizzle/` (DAL, modelos, policies, migraciones) se queda como está: es la base sobre la que se
apoya `infra`.

### 7.1 Reglas de dependencia

| Capa | Puede importar | No puede importar |
| --- | --- | --- |
| `@core` | sólo sí misma (y `uuidv7`) | `@app`, `@infra`, `@dal`, `@db`, drizzle, dockdi |
| `@app` | `@core`, `@dal` (`Chronicler`, `Transactor`, tokens), dockdi (para declarar tokens) | `@infra`, `@db`, drizzle |
| `@infra` | `@core`, `@app`, `@dal`, `@db`, drizzle | — |
| `@dock`, `cmd/` | todo | — |

La regla que más protege: **el dominio nunca importa drizzle**. Si `project.entity.ts` importa
algo de `drizzle-orm` o de `@db`, algo se filtró.

---

## 8. Lo que conviene evitar

| Tentación | Por qué no |
| --- | --- |
| Un `BaseRepository<T>` genérico con `findAll(where)` | Expone drizzle a quien lo usa y vuelve a juntar lectura y escritura |
| Que las queries devuelvan entidades de dominio | Obliga a hacer `reconstitute` de filas que sólo se van a mostrar, y no sirve para vistas con joins |
| Pasar `SQL` de drizzle desde `@app` | El filtro tipado (`ProjectFilter`) existe justamente para que la capa de aplicación no hable SQL |
| Un "lenguaje de filtros" genérico (`{ field, op, value }[]`) | Es flexible pero pierde los tipos: vuelve a aceptar cualquier campo y cualquier operador |
| `offset` para listas que crecen | Se degrada con el tamaño de la tabla; el cursor no |
| Poner el `tenantId` en la entidad | Mezcla infraestructura con dominio; ya lo resuelven `TenantToken` y RLS |

---

## 9. Validación en la frontera

Los tipos protegen **dentro** del código; lo que llega desde afuera (un request HTTP) hay que
validarlo antes de convertirlo en esos tipos. Ya tienes `zod` en las dependencias:

```ts
const listProjectsInput = z.object({
	search: z.string().max(100).optional(),
	sort: z.enum(["name", "createdAt"]).default("createdAt"),
	direction: z.enum(["asc", "desc"]).default("desc"),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	after: z.uuid().optional(),
});
```

La ruta HTTP valida con zod, arma un `ListProjectsParams` y llama a la query. **Adentro no se
vuelve a validar**: si el tipo dice `ProjectSortField`, ya es uno válido.

---

## 10. Qué quedó implementado

| Módulo | `@core` | `@app` | `@infra` |
| --- | --- | --- | --- |
| `tenants` | `Tenant`, `TenantId`, `TenantRepository` | `OnboardTenant` | `DrizzleTenantRepository`, `TenantMapper` |
| `users` | `User`, `UserId`, `UserRepository` | `ChangePassword` | `DrizzleUserRepository`, `UserMapper` |
| `memberships` | `Membership`, `MembershipRepository` | — | `DrizzleMembershipRepository`, `MembershipMapper` |
| `projects` | `Project`, `ProjectId`, `ProjectRepository` | `CreateProject`, `RenameProject`, `CreateAvailableProjects`, `ListProjects` | `DrizzleProjectRepository`, `ProjectMapper`, `ProjectCriteria`, `DrizzleListProjects` |
| `auditrail` | — | `ListAuditrail` | `DrizzleListAuditrail` |

`tasks` tiene modelo pero todavía no módulo: `DrizzleListProjects` la usa sólo para el conteo.

---

## 11. Decisiones tomadas

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Estructura | Por módulo, dentro de `@core` / `@app` / `@infra` |
| 2 | Nombres | Clases con `execute` sin sufijo (`CreateProject`, `ListProjects`); archivos con sufijo (`*.usecase.ts`, `*.query.ts`) |
| 3 | Escritura | `add` + `update` separados |
| 4 | Paginación | Sólo cursor, y funciona con cualquier orden (sección 5.5) |
| 5 | Ids | Con marca desde el inicio (`TenantId`, `UserId`, `ProjectId`) |

Ajustes respecto de la propuesta original, que salieron al implementarla:

- **Los tokens viven en `@app`** (`<módulo>.tokens.ts`), no junto a la interfaz en `@core`. Así
  `@core` no depende de `dockdi`.
- **Las queries también tienen contrato.** `ListProjects` es una interfaz en `@app` y
  `DrizzleListProjects` su implementación en `@infra`, igual que los repositorios. Sin eso, los
  tokens de `@app` tendrían que importar de `@infra`.
- **El cursor es compuesto sin cambiar de forma**: sigue siendo sólo el `id` de la última fila,
  y `Paginator.after` compara `(columna, id)` con una subconsulta. El "límite honesto" que
  anticipaba la propuesta ya no aplica.
- **Casts en la frontera de contexto**: `OnboardTenant` y `ChangePassword` reciben el tenant y el
  actor como `string` (`TenantToken` / `ActorToken` son de la DAL) y los convierten a
  `TenantId` / `UserId`. Es el segundo y último lugar con `as`, junto con los mappers.
