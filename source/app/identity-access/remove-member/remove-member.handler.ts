import { type IMembershipRepository, type ITenantRepository, MembershipError, MembershipPolicy, TenantError } from "@core/identity-access";
import { type MembershipView, toMembershipView } from "../identity-access.views";
import type { RemoveMemberCommand } from "./remove-member.schema";
import type { RunContext } from "@dal/dal.contexter";
import type { Clock } from "@keys/system.dockey";

export class RemoveMemberHandler {
	constructor(
		private readonly tenants: ITenantRepository,
		private readonly memberships: IMembershipRepository,
		private readonly context: RunContext,
		private readonly now: Clock,
	) {}

	async execute(command: RemoveMemberCommand): Promise<MembershipView> {
		const tenantId = this.context.tenant;
		if (!(await this.tenants.lock(tenantId))) throw new TenantError("tenant_not_found");

		const actor = await this.memberships.findActive(tenantId, this.context.actor);
		if (!actor) throw new MembershipError("not_a_member");

		const target = await this.memberships.findActive(tenantId, command.userId);
		if (!target) throw new MembershipError("member_not_found");
		MembershipPolicy.assertCanRemove(actor, target);
		MembershipPolicy.assertKeepsOwner(target, await this.memberships.countActiveOwners(tenantId));

		const removed = target.remove(this.now());
		await this.memberships.update(removed);
		return toMembershipView(removed);
	}
}
