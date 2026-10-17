import type { TenantId, UserId } from "@core/shared-kernel";
import { TransactionScopeError } from "./dal.exceptions";

export class RunContext {
	private constructor(
		readonly tenantId: TenantId | null,
		readonly actorId: UserId | null,
		readonly origin: string,
	) {
		if (!origin.trim()) throw new TransactionScopeError("the context needs an origin");
		Object.freeze(this);
	}

	static tenant(tenantId: TenantId, actorId: UserId, origin = "request"): RunContext {
		return new RunContext(tenantId, actorId, origin);
	}

	static platform(actorId: UserId, origin = "request"): RunContext {
		return new RunContext(null, actorId, origin);
	}

	static system(origin: string, tenantId?: TenantId): RunContext {
		return new RunContext(tenantId ?? null, null, origin);
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
