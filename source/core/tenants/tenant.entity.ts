import type { TenantId } from "@core/tenants/tenant.ids";

export type TenantPlan = "free" | "pro";
export type TenantStatus = "active" | "suspended";

export interface TenantSnapshot {
	readonly id: TenantId;
	readonly name: string;
	readonly slug: string;
	readonly plan: TenantPlan;
	readonly status: TenantStatus;
	readonly createdAt: Date;
}

export class Tenant {
	private constructor(private readonly state: TenantSnapshot) {}

	static create(id: TenantId, name: string, slug: string): Tenant {
		return new Tenant({ id, name, slug, plan: "free", status: "active", createdAt: new Date() });
	}

	get id(): TenantId {
		return this.state.id;
	}

	snapshot(): TenantSnapshot {
		return this.state;
	}
}
