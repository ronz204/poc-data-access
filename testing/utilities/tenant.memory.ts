import type { IMembershipRepository, ITenantRepository, Membership, MembershipId, Tenant } from "@core/identity-access";
import type { TenantId } from "@core/shared-kernel";

export class InMemoryTenantRepository implements ITenantRepository {
	readonly stored = new Map<TenantId, Tenant>();

	async insert(tenant: Tenant): Promise<void> {
		this.stored.set(tenant.id, tenant);
	}
}

export class InMemoryMembershipRepository implements IMembershipRepository {
	readonly stored = new Map<MembershipId, Membership>();

	async insert(membership: Membership): Promise<void> {
		this.stored.set(membership.id, membership);
	}
}
