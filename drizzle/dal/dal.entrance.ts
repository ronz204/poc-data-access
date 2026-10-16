import type { TenantId } from "@core/shared-kernel";
import type { Executor } from "./dal.transactor";
import { tenants } from "@db/models/platform/tenants.model";
import { TransactionScopeError } from "./dal.exceptions";
import { SlapContext } from "./dal.contexter";
import { and, eq, sql } from "drizzle-orm";

// The one operation that changes a run's tenant after it has started. A platform run (an actor and no
// tenant) that has just inserted a tenant needs that tenant's own rows and audit entry to pass the row-level
// policies, which compare the row's tenant with the transaction's setting; entering re-applies the setting.
//
// It is reserved for creating a tenant, and it is safe even if misused: only a platform context can enter,
// only once (afterwards the context has a tenant), and only a tenant inserted by this very transaction.
export class TenantEntrance {
	constructor(
		private readonly slap: Executor,
		private readonly context: SlapContext,
		private readonly apply: (context: SlapContext) => Promise<void>,
	) {}

	async enter(tenantId: TenantId): Promise<void> {
		SlapContext.assertEnterable(this.context);

		// A row's xmin is the id of the transaction that inserted it, so this holds only for a tenant created
		// in the current top-level transaction. A run never nests, so there is no savepoint to confuse it.
		const [created] = await this.slap
			.select({ id: tenants.id })
			.from(tenants)
			.where(and(eq(tenants.id, tenantId), sql`xmin = pg_current_xact_id()::xid`));
		if (!created) throw new TransactionScopeError("a tenant can only be entered by the transaction that created it");

		SlapContext.enter(this.context, tenantId);
		await this.apply(this.context);
	}
}
