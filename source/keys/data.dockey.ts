import type { SlapContext } from "@dal/dal.contexter";
import type { TenantEntrance } from "@dal/dal.entrance";
import { type Executor, Transactor } from "@dal/dal.transactor";
import { drizzle } from "drizzle-orm/postgres-js";
import { type Module, token } from "dockdi";
import { env } from "@env";

export class DataDockey {
	static readonly Slap = token<Executor>("Slap");
	static readonly Database = token<ReturnType<typeof drizzle>>("Database");
	static readonly Context = token<SlapContext>("Context");
	static readonly Transactor = token<Transactor>("Transactor");
	static readonly Entrance = token<TenantEntrance>("Entrance");

	// Not part of Scoped on purpose: only the binding of the handler that creates a tenant lists it.
	static readonly Scoped = [DataDockey.Slap, DataDockey.Context] as const;

	static module(): Module {
		return (container) => {
			container
				.bind(DataDockey.Database)
				.toFactory(() => drizzle(env.POSTGRES_RUNNER_URL))
				.inSingleton();

			container
				.bind(DataDockey.Transactor)
				.toFactory((database) => new Transactor(container, database, DataDockey), [DataDockey.Database])
				.inSingleton();
		};
	}
}
