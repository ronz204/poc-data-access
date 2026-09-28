import type { Tenant } from "@core/tenants/tenant.entity";

export interface TenantRepository {
	add(tenant: Tenant): Promise<void>;
}
