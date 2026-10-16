import type { TenantId, UserId } from "@core/shared-kernel";
import { TransactionScopeError } from "./dal.exceptions";

export class SlapContext {
	private constructor(
		readonly tenantId: TenantId | null,
		readonly actorId: UserId | null,
		readonly origin: string,
	) {
		if (!origin.trim()) throw new TransactionScopeError("the context needs an origin");
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

	get tenant(): TenantId {
		if (!this.tenantId) throw new TransactionScopeError("the operation needs a tenant");
		return this.tenantId;
	}

	get actor(): UserId {
		if (!this.actorId) throw new TransactionScopeError("the operation needs an actor");
		return this.actorId;
	}
}
