import { type RunExecutor, Transactor } from "@dal/dal.transactor";
import type { RunContext } from "@dal/dal.contexter";
import { drizzle } from "drizzle-orm/postgres-js";
import { type Module, token } from "dockdi";
import { env } from "@env";

export type Database = ReturnType<typeof drizzle>;

export class DataDockey {
	static readonly Database = token<Database>("Database");
	static readonly Executor = token<RunExecutor>("Executor");
	static readonly Context = token<RunContext>("Context");
	static readonly Transactor = token<Transactor>("Transactor");

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
