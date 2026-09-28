import { ErrorClassifier } from "@dal/dal.classifier";
import { TransactionScopeError } from "@dal/dal.exceptions";
import type { Executor } from "@db/helpers/executor.helper";
import { type Container, type Token, token } from "dockdi";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

export const TxToken = token<Executor>("Tx");
export const TenantToken = token<string>("Tenant");
export const TransactorToken = token<Transactor>("Transactor");

export class Transactor {
	private constructor(
		private readonly container: Container,
		private readonly executor: Executor,
		private readonly tenantId: string | null,
		private readonly nested: boolean,
		private readonly client: postgres.Sql | null,
	) {}

	static create(container: Container, client: postgres.Sql): Transactor {
		return new Transactor(container, drizzle({ client }), null, false, client);
	}

	forTenant(tenantId: string): Transactor {
		if (this.nested && tenantId !== this.tenantId) {
			throw new TransactionScopeError("a nested run cannot switch tenant");
		}
		return new Transactor(this.container, this.executor, tenantId, this.nested, null);
	}

	async run<S, R>(entry: Token<S>, work: (service: S) => Promise<R>): Promise<R> {
		try {
			return await this.executor.transaction(async (tx) => {
				const scope = this.container.scope();

				if (this.tenantId && !this.nested) {
					await tx.execute(sql`select set_config('app.tenant_id', ${this.tenantId}, true)`);
					scope.bind(TenantToken).toValue(this.tenantId);
				}

				scope.bind(TxToken).toValue(tx);
				scope.bind(TransactorToken).toValue(new Transactor(scope, tx, this.tenantId, true, null));
				return work(scope.resolve(entry));
			});
		} catch (error) {
			throw ErrorClassifier.normalize(error);
		}
	}

	async close(): Promise<void> {
		await this.client?.end();
	}
}
