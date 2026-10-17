import { type IMembershipRepository, type ITenantRepository, MembershipError, MembershipPolicy } from "@core/identity-access";
import { AdmissionError } from "@core/shared-kernel";
import type { ChangeRoleCommand } from "./change-role.schema";
import { type MembershipView, toMembershipView } from "../identity-access.views";
import type { RunContext } from "@dal/dal.contexter";

export class ChangeRoleHandler {
	constructor(
		private readonly tenants: ITenantRepository,
		private readonly memberships: IMembershipRepository,
		private readonly context: RunContext,
	) {}

	async execute(command: ChangeRoleCommand): Promise<MembershipView> {
		const tenantId = this.context.tenant;
		await this.tenants.lock(tenantId);

		const actor = await this.memberships.findActive(tenantId, this.context.actor);
		if (!actor) throw new AdmissionError("not_a_member");
		MembershipPolicy.assertCanChangeRole(actor);

		const target = await this.memberships.findActive(tenantId, command.userId);
		if (!target) throw new MembershipError("member_not_found");

		const next = target.changeRole(command.role);
		if (next === target) return toMembershipView(target);

		if (target.isOwner()) MembershipPolicy.assertKeepsOwner(target, await this.memberships.countActiveOwners(tenantId));

		await this.memberships.update(next);
		return toMembershipView(next);
	}
}
