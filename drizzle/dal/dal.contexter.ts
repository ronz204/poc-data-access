import type { TenantId, UserId } from "@core/shared-kernel";
import { TransactionScopeError } from "./dal.exceptions";

export class SlapContext {
	// Private fields stay writable on a frozen object: the tenant is the one value a run may change,
	// and only through `enter`, so every reader holding this context sees the live value.
	#tenantId: TenantId | null;

	private constructor(
		tenantId: TenantId | null,
		readonly actorId: UserId | null,
		readonly origin: string,
	) {
		if (!origin.trim()) throw new TransactionScopeError("the context needs an origin");
		this.#tenantId = tenantId;
		Object.freeze(this);
	}

	static tenant(tenantId: TenantId, actorId: UserId, origin = "request"): SlapContext {
		return new SlapContext(tenantId, actorId, origin);
	}

	static platform(actorId: UserId, origin = "request"): SlapContext {
		return new SlapContext(null, actorId, origin);
	}

	static system(origin: string, tenantId?: TenantId): SlapContext {
		return new SlapContext(tenantId ?? null, null, origin);
	}

	get tenantId(): TenantId | null {
		return this.#tenantId;
	}

	get tenant(): TenantId {
		if (!this.#tenantId) throw new TransactionScopeError("the operation needs a tenant");
		return this.#tenantId;
	}

	get actor(): UserId {
		if (!this.actorId) throw new TransactionScopeError("the operation needs an actor");
		return this.actorId;
	}

	// The Transactor runs every unit of work on its own copy, so entering a tenant never changes the
	// object the caller built and may reuse for the next run.
	fork(): SlapContext {
		return new SlapContext(this.#tenantId, this.actorId, this.origin);
	}

	// Reserved for the Transactor's tenant entry (see TenantEntrance); not an operation for handlers.
	static assertEnterable(context: SlapContext): void {
		if (context.#tenantId) throw new TransactionScopeError("the context already has a tenant");
		if (!context.actorId) throw new TransactionScopeError("entering a tenant needs an actor");
	}

	static enter(context: SlapContext, tenantId: TenantId): void {
		SlapContext.assertEnterable(context);
		context.#tenantId = tenantId;
	}
}
