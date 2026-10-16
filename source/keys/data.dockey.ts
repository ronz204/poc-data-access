import { env } from "@env";
import type { SlapContext } from "@dal/dal.contexter";
import { type Database, type Executor, Transactor } from "@dal/dal.transactor";
import { type Module, token } from "dockdi";
import { drizzle } from "drizzle-orm/postgres-js";

export class DataDockey {
	static readonly Slap = token<Executor>("Slap");
	static readonly Database = token<Database>("Database");
	static readonly Context = token<SlapContext>("Context");
	static readonly Transactor = token<Transactor>("Transactor");

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
