import type { Tenant } from "@core/tenants/tenant.entity";
import { TenantSlugTakenError } from "@core/tenants/tenant.errors";
import type { TenantRepository } from "@core/tenants/tenant.repository";
import { ViolationTranslator } from "@dal/dal.translator";
import type { Executor } from "@db/helpers/executor.helper";
import { TenantConstraints, tenants } from "@db/models/tenants.model";
import { TenantMapper } from "@infra/tenants/tenant.mapper";

export class DrizzleTenantRepository implements TenantRepository {
	constructor(private readonly tx: Executor) {}

	async add(tenant: Tenant): Promise<void> {
		const row = TenantMapper.toRow(tenant.snapshot());
		await ViolationTranslator.translate(this.tx.insert(tenants).values(row), {
			[TenantConstraints.slug]: () => new TenantSlugTakenError(row.slug),
		});
	}
}
