import { Membership, MembershipId, MembershipRole } from "@core/identity-access";
import type { memberships } from "@db/models/platform/memberships.model";
import { TenantId, UserId } from "@core/shared-kernel";

type MembershipRow = typeof memberships.$inferSelect;

export class MembershipMapper {
	static toRow(membership: Membership): MembershipRow {
		return {
			id: membership.id,
			tenantId: membership.tenantId,
			userId: membership.userId,
			role: membership.role,
			createdAt: membership.createdAt,
			removedAt: membership.removedAt,
		};
	}

	static toDomain(row: MembershipRow): Membership {
		return Membership.restore({
			id: MembershipId.parse(row.id),
			tenantId: TenantId.parse(row.tenantId),
			userId: UserId.parse(row.userId),
			role: MembershipRole.parse(row.role),
			createdAt: row.createdAt,
			removedAt: row.removedAt,
		});
	}
}
