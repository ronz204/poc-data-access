import { Membership } from "@core/memberships/membership.entity";
import type { MembershipRepository } from "@core/memberships/membership.repository";
import { Tenant } from "@core/tenants/tenant.entity";
import type { TenantId } from "@core/tenants/tenant.ids";
import type { TenantRepository } from "@core/tenants/tenant.repository";
import { User } from "@core/users/user.entity";
import type { UserId } from "@core/users/user.ids";
import type { UserRepository } from "@core/users/user.repository";
import { Chronicler } from "@dal/dal.chronicler";

export interface OnboardTenantInput {
	readonly name: string;
	readonly slug: string;
	readonly ownerEmail: string;
	readonly ownerName: string;
	readonly passwordHash: string;
}

export class OnboardTenant {
	constructor(
		private readonly tenants: TenantRepository,
		private readonly users: UserRepository,
		private readonly memberships: MembershipRepository,
		private readonly chronicler: Chronicler,
		private readonly tenantId: string,
		private readonly actorId: string,
	) {}

	async execute(input: OnboardTenantInput): Promise<void> {
		const tenant = Tenant.create(this.tenantId as TenantId, input.name, input.slug);
		await this.tenants.add(tenant);
		await this.chronicler.record({
			action: "tenant.created",
			entity: "tenants",
			entityId: tenant.id,
			changes: Chronicler.created({ name: input.name, slug: input.slug }),
		});

		const owner = User.create(
			this.actorId as UserId,
			input.ownerEmail,
			input.ownerName,
			input.passwordHash,
		);
		await this.users.add(owner);
		await this.chronicler.record({
			action: "user.created",
			entity: "users",
			entityId: owner.id,
			changes: Chronicler.created({ email: input.ownerEmail, name: input.ownerName }),
		});

		const membership = Membership.create(owner.id, "owner");
		await this.memberships.add(membership);
		await this.chronicler.record({
			action: "membership.created",
			entity: "memberships",
			changes: Chronicler.created({ userId: owner.id, role: "owner" }),
		});
	}
}
