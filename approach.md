# Approach: POC de patrones de persistencia (Drizzle + Postgres)

## Objetivo

Aprender y probar patrones de persistencia con Drizzle y Postgres sobre un dominio realista: un **mini-Shopify multi-tenant con wallet interno**. La infraestructura (compose, roles, init scripts) es parte del ejercicio, pero no el foco principal.

## Temas a practicar

| Tema | Dónde se practica |
|---|---|
| Transactor manager (dockdi + drizzle) | Todo caso de uso que escriba en más de una tabla |
| Repos + CQRS lite | Repos de escritura por agregado; queries de lectura separadas en `reporting` |
| Audit trail | `audit.trailer`, alimentada desde el transactor con el contexto del request |
| Concurrencia | Descuento de stock y doble gasto en el wallet |
| Idempotency | `POST /orders` con `Idempotency-Key` |
| Outbox pattern | `messaging.events` + worker con `FOR UPDATE SKIP LOCKED` |
| Soft delete | `catalog.products`, `sales.customers` |
| Migrations | drizzle-kit + migraciones a mano (roles, grants, RLS, índices parciales, expand/contract) |
| Multi-tenancy con RLS | `tenant_id` en todas las tablas + policies con `app.tenant_id` |
| Paginación por cursor | Órdenes y movimientos del wallet por `(created_at, id)` |
| Queries con joins | Read models: ventas por producto/mes, top clientes, órdenes con items y cliente |

## Schemas de Postgres

Separados por bounded context, no por tipo de tabla.

| Schema | Tablas | Notas |
|---|---|---|
| `platform` | `tenants`, `users`, `memberships` | Identidad y tenancy. `tenants` es la raíz y no lleva RLS. |
| `catalog` | `products`, `categories` | `products`: soft delete, stock, `version`. Dueño del stock. |
| `sales` | `customers`, `orders`, `items` | `customers`: soft delete. `items` guarda snapshot de precio y nombre. |
| `wallet` | `accounts`, `entries` | `entries` es un ledger inmutable (sin `UPDATE`/`DELETE`). |
| `messaging` | `events`, `idempotency` | `events` es el outbox. `idempotency` guarda key, hash del request y respuesta. |
| `audit` | `trailer` | Append-only para la app. Candidata a particionarse por mes. |
| `reporting` | views / materialized views | Solo lectura. Es el lado "Q" de CQRS. |

### Diagrama de dependencias

```
platform.tenants  <──  (tenant_id en todas las demás)
catalog.products  <──  sales.items          (FK real)
sales.orders      ···> wallet.entries       (referencia lógica, sin FK)
sales.orders      ···> messaging.events     (referencia lógica, sin FK)
*                 ···> audit.trailer        (referencia lógica, sin FK)
```

### Reglas de diseño

1. **FKs entre schemas:** todo apunta a `platform.tenants`; `sales.items` → `catalog.products` con FK real. `wallet`, `messaging` y `audit` usan referencia lógica (`reference_type`, `reference_id`) para practicar el desacople.
2. **Snapshots:** `sales.items` copia precio y nombre del producto al momento de la compra.
3. **Nombres siempre calificados** (`catalog.products`). El rol de la app tiene `search_path` fijo.
4. **Stock** vive en `catalog.products` al inicio. Extraerlo a un schema `inventory` es un ejercicio de refactor posterior (migración expand/contract).

## Roles y permisos

| Rol | Permisos |
|---|---|
| `migrator` | Dueño de todos los objetos. Solo lo usa drizzle-kit. Bypassea RLS. |
| `app_rw` | Lee/escribe `catalog`, `sales`, `wallet`, `messaging`. Solo `INSERT` en `audit.trailer`. Solo `INSERT`/`SELECT` en `wallet.entries`. Sujeto a RLS. |
| `app_reader` | Solo `SELECT` en `reporting`. Sujeto a RLS. |

**Cuidado:** si la app conecta como dueño de la tabla, RLS no aplica salvo con `FORCE ROW LEVEL SECURITY`. Debe haber un test que lo verifique.

## RLS

- Cada transacción hace `SET LOCAL app.tenant_id = '<uuid>'` al abrirse (lo hace el transactor).
- Las policies leen `current_setting('app.tenant_id')`.
- Helper reutilizable: `platform.enable_tenant_rls(schema, table)`, llamado desde migraciones a mano.
- Tests: un tenant no puede leer ni escribir datos de otro, tampoco con SQL crudo.

## Estructura de código (Drizzle)

```
drizzle/
  dal/                     // Transactor and related data-access code
  database/
    models/
      platform.model.ts    // pgSchema('platform')
      catalog.model.ts
      sales.model.ts
      wallet.model.ts
      messaging.model.ts
      audit.model.ts
    policies/
    helpers/
  migrations/
```

- `drizzle.config.ts` con `schemaFilter: ['platform','catalog','sales','wallet','messaging','audit']`.
- El journal de migraciones vive en su propio schema para no mezclarlo con el dominio.
- Lo que drizzle-kit no genera (roles, grants, policies, triggers, índices parciales) va en migraciones SQL escritas a mano.

## Detalle por tema

### Concurrencia
- Checkout simultáneo sobre el mismo producto (100 requests en paralelo, `Promise.all` contra Postgres real).
- Comparar tres estrategias: `SELECT … FOR UPDATE`, update atómico condicional (`stock = stock - n WHERE stock >= n`) y optimistic locking con `version`.
- Doble gasto en `wallet.accounts`.

### Idempotency
- `Idempotency-Key` en `POST /orders`, tabla `messaging.idempotency`.
- Casos: mismo key + mismo body devuelve la misma respuesta; mismo key + otro body da 422; dos requests simultáneos con el mismo key se resuelven con unique constraint.

### Outbox
- `OrderPlaced` se inserta en `messaging.events` dentro de la misma transacción que la orden.
- Worker con polling y `FOR UPDATE SKIP LOCKED`; publica (log o webhook fake) y marca como enviado.
- Prueba: forzar un fallo a mitad de camino y verificar que el evento no se pierde ni se duplica.

### Soft delete
- `deleted_at` en `catalog.products` y `sales.customers`.
- Unique parciales (`WHERE deleted_at IS NULL`), filtrado consistente en repos, restauración.

### Audit trail
- `audit.trailer`: tenant, actor, acción, entidad, `entity_id`, diff, timestamp.
- Contexto (actor, tenant, request id) propagado con AsyncLocalStorage y escrito desde el transactor.
- Variante a comparar: snapshot vs diff; app-level vs triggers.

### Migrations
- Migraciones generadas + manuales.
- Una migración expand/contract (por ejemplo renombrar una columna sin downtime).
- Extracción del stock a `inventory` como ejercicio final.

### Paginación y joins
- Cursor sobre `(created_at, id)` para órdenes y movimientos del wallet.
- Comparar con offset usando un seed de ~1M filas y `EXPLAIN ANALYZE`.
- Read models en `reporting`: CTEs, window functions, `GROUP BY`.

## Hitos

0. **Infra base:** compose, init script con schemas, roles y grants.
1. **Migraciones base** y transactor con dockdi + drizzle (incluye `SET LOCAL app.tenant_id`).
2. **Repos y CRUD de productos** con soft delete.
3. **Checkout básico** transaccional (orden + items + stock).
4. **Concurrencia:** tests de carga y comparación de estrategias.
5. **Idempotency** en el checkout.
6. **Outbox** y worker.
7. **Wallet** y ledger.
8. **RLS** y multi-tenancy (tests de aislamiento y de `FORCE RLS`).
9. **Audit trail** (`audit.trailer`).
10. **Read models**, joins y paginación por cursor con seed grande.
11. **Refactor:** extraer `inventory` con expand/contract.

## Alcance recortado (si hace falta)

Quitar el schema `wallet` (hito 7). Todos los temas siguen cubiertos; se pierde el ejemplo de ledger y de doble gasto.

## Fuera de alcance

- Autenticación real (se simula un actor y un tenant por request).
- Frontend.
- Broker real de mensajes (el outbox publica a un log o webhook fake).
