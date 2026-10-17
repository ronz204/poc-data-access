import type { IMembershipRepository, ITenantRepository, Membership, MembershipId, Tenant } from "@core/identity-access";
import type { TenantId, UserId } from "@core/shared-kernel";

export class InMemoryTenantRepository implements ITenantRepository {
	readonly stored = new Map<TenantId, Tenant>();
	readonly locked: TenantId[] = [];

	async lock(id: TenantId): Promise<Tenant | null> {
		this.locked.push(id);
		return this.stored.get(id) ?? null;
	}

	async insert(tenant: Tenant): Promise<void> {
		this.stored.set(tenant.id, tenant);
	}
}

export class InMemoryMembershipRepository implements IMembershipRepository {
	readonly stored = new Map<MembershipId, Membership>();

	async findActive(tenantId: TenantId, userId: UserId): Promise<Membership | null> {
		for (const membership of this.stored.values()) {
			if (membership.tenantId === tenantId && membership.userId === userId && membership.isActive()) return membership;
		}
		return null;
	}

	async countActiveOwners(tenantId: TenantId): Promise<number> {
		return [...this.stored.values()].filter((m) => m.tenantId === tenantId && m.role === "owner" && m.isActive()).length;
	}

	async insert(membership: Membership): Promise<void> {
		this.stored.set(membership.id, membership);
	}

	async update(membership: Membership): Promise<void> {
		this.stored.set(membership.id, membership);
	}
}
