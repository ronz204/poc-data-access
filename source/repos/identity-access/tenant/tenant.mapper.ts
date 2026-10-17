import { Tenant, TenantName } from "@core/identity-access";
import type { tenants } from "@db/models/platform/tenants.model";
import { TenantId } from "@core/shared-kernel";

type TenantRow = typeof tenants.$inferSelect;

export class TenantMapper {
	static toRow(tenant: Tenant): TenantRow {
		return { id: tenant.id, name: tenant.name, createdAt: tenant.createdAt };
	}

	static toDomain(row: TenantRow): Tenant {
		return Tenant.restore({ id: TenantId.parse(row.id), name: TenantName.parse(row.name), createdAt: row.createdAt });
	}
}
