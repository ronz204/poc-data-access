import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core";
import type { SlapContext } from "./dal.contexter";
import type { Container, Token } from "dockdi";
import { PoliciesHelper } from "@db/helpers/policies.helper";
import { ErrorClassifier } from "./dal.classifier";
import { TenantEntrance } from "./dal.entrance";
import { sql } from "drizzle-orm";

export type Executor = PgAsyncDatabase<PostgresJsQueryResultHKT>;
export interface TransactorTokens {
	readonly Slap: Token<Executor>;
	readonly Context: Token<SlapContext>;
	readonly Entrance: Token<TenantEntrance>;
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
				// The run owns a copy: entering a tenant changes it, never the caller's object.
				const live = context.fork();
				await Transactor.apply(slap, live);
				return work(this.open(slap, live).resolve(entry));
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
		scope.bind(this.tokens.Entrance).toValue(new TenantEntrance(slap, context, (live) => Transactor.apply(slap, live)));
		return scope;
	}
}
