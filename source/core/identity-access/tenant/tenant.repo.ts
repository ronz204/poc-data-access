import type { TenantId } from "@core/shared-kernel";
import type { Tenant } from "./tenant.aggregate";

export interface ITenantRepository {
	/** Locks the tenant's row until the run ends; raises `tenant_not_found` when there is none. */
	lock(id: TenantId): Promise<void>;
	insert(tenant: Tenant): Promise<void>;
}
