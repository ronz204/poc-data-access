import { type IMembershipRepository, type ITenantRepository, Membership, MembershipId, Tenant } from "@core/identity-access";
import type { CreateTenantCommand, CreateTenantOutput } from "./create-tenant.schema";
import type { Clock, NewId } from "@keys/system.dockey";
import { toMembershipView } from "../identity-access.views";
import type { RunContext } from "@dal/dal.contexter";
import { TenantId } from "@core/shared-kernel";

export class CreateTenantHandler {
	constructor(
		private readonly tenants: ITenantRepository,
		private readonly memberships: IMembershipRepository,
		private readonly context: RunContext,
		private readonly now: Clock,
		private readonly newId: NewId,
	) {}

	async execute(command: CreateTenantCommand): Promise<CreateTenantOutput> {
		const now = this.now();
		const tenant = Tenant.create({ id: TenantId.parse(this.newId()), ...command }, now);
		const owner = Membership.enrollOwner(
			{ id: MembershipId.parse(this.newId()), tenantId: tenant.id, userId: this.context.actor },
			now,
		);

		await this.tenants.insert(tenant);
		await this.memberships.insert(owner);

		return {
			id: tenant.id,
			name: tenant.name,
			createdAt: tenant.createdAt.toISOString(),
			ownerMembership: toMembershipView(owner),
		};
	}
}
