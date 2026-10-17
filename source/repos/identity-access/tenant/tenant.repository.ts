import { type ITenantRepository, type Tenant, TenantError } from "@core/identity-access";
import type { RunExecutor } from "@dal/dal.transactor";
import { tenants } from "@db/models/platform/tenants.model";
import type { TenantId } from "@core/shared-kernel";
import { TenantMapper } from "./tenant.mapper";
import { eq } from "drizzle-orm";

export class TenantRepository implements ITenantRepository {
	constructor(private readonly executor: RunExecutor) {}

	async lock(id: TenantId): Promise<void> {
		const [row] = await this.executor.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id)).limit(1).for("update");
		if (!row) throw new TenantError("tenant_not_found");
	}

	async insert(tenant: Tenant): Promise<void> {
		await this.executor.insert(tenants).values(TenantMapper.toRow(tenant));
	}
}
