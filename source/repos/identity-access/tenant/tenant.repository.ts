import type { ITenantRepository, Tenant } from "@core/identity-access";
import type { RunExecutor } from "@dal/dal.transactor";
import { tenants } from "@db/models/platform/tenants.model";
import type { TenantId } from "@core/shared-kernel";
import { TenantMapper } from "./tenant.mapper";
import { eq } from "drizzle-orm";

export class TenantRepository implements ITenantRepository {
	constructor(private readonly executor: RunExecutor) {}

	async lock(id: TenantId): Promise<Tenant | null> {
		const [row] = await this.executor.select().from(tenants).where(eq(tenants.id, id)).limit(1).for("update");
		return row ? TenantMapper.toDomain(row) : null;
	}

	async insert(tenant: Tenant): Promise<void> {
		await this.executor.insert(tenants).values(TenantMapper.toRow(tenant));
	}
}
