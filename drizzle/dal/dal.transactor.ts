import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core";
import type { RunContext } from "./dal.contexter";
import type { Container, Token } from "dockdi";
import { PoliciesHelper } from "@db/helpers/policies.helper";
import { ErrorClassifier } from "./dal.classifier";
import { sql } from "drizzle-orm";

export type RunExecutor = PgAsyncDatabase<PostgresJsQueryResultHKT>;

export interface TransactorTokens {
	readonly Executor: Token<RunExecutor>;
	readonly Context: Token<RunContext>;
}

export class Transactor {
	constructor(
		private readonly container: Container,
		private readonly database: RunExecutor,
		private readonly tokens: TransactorTokens,
	) {}

	async run<S, R>(context: RunContext, entry: Token<S>, work: (service: S) => Promise<R>): Promise<R> {
		try {
			return await this.database.transaction(async (executor) => {
				await Transactor.apply(executor, context);
				return work(this.open(executor, context).resolve(entry));
			});
		} catch (error) {
			throw ErrorClassifier.normalize(error);
		}
	}

	private static async apply(executor: RunExecutor, context: RunContext): Promise<void> {
		const { tenantKey, actorKey, originKey } = PoliciesHelper;

		await executor.execute(sql`select
			set_config(${tenantKey}, ${context.tenantId ?? ""}, true),
			set_config(${actorKey}, ${context.actorId ?? ""}, true),
			set_config(${originKey}, ${context.origin}, true)`);
	}

	private open(executor: RunExecutor, context: RunContext): Container {
		const scope = this.container.scope();

		scope.bind(this.tokens.Executor).toValue(executor);
		scope.bind(this.tokens.Context).toValue(context);
		return scope;
	}
}
