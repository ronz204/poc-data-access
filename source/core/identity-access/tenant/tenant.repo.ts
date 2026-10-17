import type { Tenant } from "./tenant.aggregate";

export interface ITenantRepository {
	insert(tenant: Tenant): Promise<void>;
}
