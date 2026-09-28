import type { TenantSnapshot } from "@core/tenants/tenant.entity";
import type { tenants } from "@db/models/tenants.model";

type TenantInsert = typeof tenants.$inferInsert;

export class TenantMapper {
	static toRow(snapshot: TenantSnapshot): TenantInsert {
		return { ...snapshot };
	}
}
