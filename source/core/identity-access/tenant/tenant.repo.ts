import type { TenantId } from "@core/shared-kernel";
import type { Tenant } from "./tenant.aggregate";

export interface ITenantRepository {
	lock(id: TenantId): Promise<Tenant | null>;
	insert(tenant: Tenant): Promise<void>;
}
