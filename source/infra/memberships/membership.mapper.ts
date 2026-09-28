import type { MembershipSnapshot } from "@core/memberships/membership.entity";
import type { memberships } from "@db/models/memberships.model";

type MembershipInsert = typeof memberships.$inferInsert;

export class MembershipMapper {
	static toRow(snapshot: MembershipSnapshot, tenantId: string): MembershipInsert {
		return { ...snapshot, tenantId };
	}
}
