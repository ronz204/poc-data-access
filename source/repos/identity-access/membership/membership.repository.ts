import { type IMembershipRepository, type Membership, MembershipError } from "@core/identity-access";
import { memberships } from "@db/models/platform/memberships.model";
import type { RunExecutor } from "@dal/dal.transactor";
import { ViolationTranslator } from "@dal/dal.translator";
import { MembershipMapper } from "./membership.mapper";

export class MembershipRepository implements IMembershipRepository {
	constructor(private readonly executor: RunExecutor) {}

	async insert(membership: Membership): Promise<void> {
		await ViolationTranslator.translate(this.executor.insert(memberships).values(MembershipMapper.toRow(membership)), {
			memberships_user_id_users_id_fkey: () => new MembershipError("user_not_found"),
		});
	}
}
