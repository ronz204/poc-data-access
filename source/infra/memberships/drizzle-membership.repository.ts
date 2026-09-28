import type { Membership } from "@core/memberships/membership.entity";
import type { MembershipRepository } from "@core/memberships/membership.repository";
import type { Executor } from "@db/helpers/executor.helper";
import { memberships } from "@db/models/memberships.model";
import { MembershipMapper } from "@infra/memberships/membership.mapper";

export class DrizzleMembershipRepository implements MembershipRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async add(membership: Membership): Promise<void> {
		await this.tx
			.insert(memberships)
			.values(MembershipMapper.toRow(membership.snapshot(), this.tenantId));
	}
}
