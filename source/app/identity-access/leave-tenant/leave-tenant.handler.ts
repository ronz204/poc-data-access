import { type IMembershipRepository, type ITenantRepository, MembershipError, MembershipPolicy, TenantError } from "@core/identity-access";
import { type MembershipView, toMembershipView } from "../identity-access.views";
import type { RunContext } from "@dal/dal.contexter";
import type { Clock } from "@keys/system.dockey";

export class LeaveTenantHandler {
	constructor(
		private readonly tenants: ITenantRepository,
		private readonly memberships: IMembershipRepository,
		private readonly context: RunContext,
		private readonly now: Clock,
	) {}

	async execute(): Promise<MembershipView> {
		const tenantId = this.context.tenant;
		if (!(await this.tenants.lock(tenantId))) throw new TenantError("tenant_not_found");

		const own = await this.memberships.findActive(tenantId, this.context.actor);
		if (!own) throw new MembershipError("not_a_member");
		MembershipPolicy.assertKeepsOwner(own, await this.memberships.countActiveOwners(tenantId));

		const left = own.remove(this.now());
		await this.memberships.update(left);
		return toMembershipView(left);
	}
}
