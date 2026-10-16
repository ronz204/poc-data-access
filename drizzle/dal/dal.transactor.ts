import { PoliciesHelper } from "@db/helpers/policies.helper";
import type { Container, Token } from "dockdi";
import { sql } from "drizzle-orm";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { ErrorClassifier } from "./dal.classifier";
import type { SlapContext } from "./dal.contexter";

export type Executor = PgAsyncDatabase<PostgresJsQueryResultHKT>;
export interface TransactorTokens {
	readonly Slap: Token<Executor>;
	readonly Context: Token<SlapContext>;
}

export class Transactor {
	constructor(
		private readonly container: Container,
		private readonly database: Executor,
		private readonly tokens: TransactorTokens,
	) {}

	async run<S, R>(context: SlapContext, entry: Token<S>, work: (service: S) => Promise<R>): Promise<R> {
		try {
			return await this.database.transaction(async (slap) => {
				await Transactor.apply(slap, context);
				return work(this.open(slap, context).resolve(entry));
			});
		} catch (error) {
			throw ErrorClassifier.normalize(error);
		}
	}

	private static async apply(slap: Executor, context: SlapContext): Promise<void> {
		const { tenantKey, actorKey, originKey } = PoliciesHelper;

		await slap.execute(sql`select
			set_config(${tenantKey}, ${context.tenantId ?? ""}, true),
			set_config(${actorKey}, ${context.actorId ?? ""}, true),
			set_config(${originKey}, ${context.origin}, true)`);
	}

	private open(slap: Executor, context: SlapContext): Container {
		const scope = this.container.scope();

		scope.bind(this.tokens.Slap).toValue(slap);
		scope.bind(this.tokens.Context).toValue(context);
		return scope;
	}
}
