import { Entity, type EntityState, type TenantId } from "@core/shared-kernel";
import type { TenantName } from "./tenant.vos";

export interface TenantState extends EntityState<TenantId> {
	readonly name: TenantName;
	readonly createdAt: Date;
}

export type TenantCreateInput = Omit<TenantState, "createdAt">;

export class Tenant extends Entity<TenantState>() {
	private constructor(state: TenantState) {
		super(state);
	}

	static create(input: TenantCreateInput, now: Date): Tenant {
		return new Tenant({ ...input, createdAt: now });
	}
}
