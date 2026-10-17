import { type AdmissionView, MembershipRole, TenantId, UserId } from "@core/shared-kernel";
import { memberships } from "@db/models/platform/memberships.model";
import type { RunExecutor } from "@dal/dal.transactor";
import { and, eq, isNull } from "drizzle-orm";

export class AdmissionQuery {
	constructor(private readonly executor: RunExecutor) {}

	async execute(tenantId: TenantId, userId: UserId): Promise<AdmissionView | null> {
		const [row] = await this.executor
			.select({ tenantId: memberships.tenantId, userId: memberships.userId, role: memberships.role })
			.from(memberships)
			.where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), isNull(memberships.removedAt)))
			.limit(1);

		return row
			? { tenantId: TenantId.parse(row.tenantId), userId: UserId.parse(row.userId), role: MembershipRole.parse(row.role) }
			: null;
	}
}
