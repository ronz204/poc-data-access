import type { ITenantRepository, Tenant } from "@core/identity-access";
import type { RunExecutor } from "@dal/dal.transactor";
import { tenants } from "@db/models/platform/tenants.model";
import { TenantMapper } from "./tenant.mapper";

export class TenantRepository implements ITenantRepository {
	constructor(private readonly executor: RunExecutor) {}

	async insert(tenant: Tenant): Promise<void> {
		await this.executor.insert(tenants).values(TenantMapper.toRow(tenant));
	}
}
