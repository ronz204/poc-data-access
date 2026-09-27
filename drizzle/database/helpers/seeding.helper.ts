import type { Executor } from "@db/helpers/executor.helper";

export interface Seeder {
	readonly name: string;
	run(db: Executor): Promise<void>;
}
