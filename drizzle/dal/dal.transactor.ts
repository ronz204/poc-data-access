import { ErrorClassifier } from "@dal/dal.classifier";
import { TransactionScopeError } from "@dal/dal.exceptions";
import type { Executor } from "@db/helpers/executor.helper";
import { type Container, type Token, token } from "dockdi";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

export interface TransactorContext {
	readonly tenantId: string | null;
	readonly actorId: string | null;
}

export const TxToken = token<Executor>("Tx");
export const TenantToken = token<string>("Tenant");
export const ActorToken = token<string>("Actor");
export const ContextToken = token<TransactorContext>("Context");
export const TransactorToken = token<Transactor>("Transactor");

export class Transactor {
	private constructor(
		private readonly container: Container,
		private readonly executor: Executor,
		private readonly context: TransactorContext,
		private readonly nested: boolean,
		private readonly client: postgres.Sql | null,
	) {}

	static create(container: Container, client: postgres.Sql): Transactor {
		const context = { tenantId: null, actorId: null };
		return new Transactor(container, drizzle({ client }), context, false, client);
	}

	forTenant(tenantId: string): Transactor {
		return this.with({ tenantId });
	}

	forActor(actorId: string): Transactor {
		return this.with({ actorId });
	}

	async run<S, R>(entry: Token<S>, work: (service: S) => Promise<R>): Promise<R> {
		try {
			return await this.executor.transaction(async (tx) => {
				const scope = this.container.scope();

				if (!this.nested) {
					const { tenantId, actorId } = this.context;
					if (tenantId) {
						await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
						scope.bind(TenantToken).toValue(tenantId);
					}
					if (actorId) scope.bind(ActorToken).toValue(actorId);
					scope.bind(ContextToken).toValue(this.context);
				}

				scope.bind(TxToken).toValue(tx);
				scope.bind(TransactorToken).toValue(new Transactor(scope, tx, this.context, true, null));
				return work(scope.resolve(entry));
			});
		} catch (error) {
			throw ErrorClassifier.normalize(error);
		}
	}

	async close(): Promise<void> {
		await this.client?.end();
	}

	private with(patch: Partial<TransactorContext>): Transactor {
		const context = { ...this.context, ...patch };
		const switched =
			context.tenantId !== this.context.tenantId || context.actorId !== this.context.actorId;
		if (this.nested && switched) {
			throw new TransactionScopeError("a nested run cannot switch context");
		}
		return new Transactor(this.container, this.executor, context, this.nested, null);
	}
}
