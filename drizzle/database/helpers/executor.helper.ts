import type { PgAsyncDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
export type Executor = PgAsyncDatabase<PostgresJsQueryResultHKT>;
