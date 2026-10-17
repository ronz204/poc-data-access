import { type IMembershipRepository, type ITenantRepository, type Membership, type MembershipId, type Tenant, TenantError } from "@core/identity-access";
import type { Email, TenantId, UserId } from "@core/shared-kernel";
import { InMemoryUserRepository } from "./user.memory";

export class InMemoryTenantRepository implements ITenantRepository {
	readonly stored = new Map<TenantId, Tenant>();
	readonly locked: TenantId[] = [];

	async lock(id: TenantId): Promise<void> {
		if (!this.stored.has(id)) throw new TenantError("tenant_not_found");
		this.locked.push(id);
	}

	async insert(tenant: Tenant): Promise<void> {
		this.stored.set(tenant.id, tenant);
	}
}

export class InMemoryMembershipRepository implements IMembershipRepository {
	readonly stored = new Map<MembershipId, Membership>();

	constructor(private readonly users = new InMemoryUserRepository()) {}

	async findActive(tenantId: TenantId, userId: UserId): Promise<Membership | null> {
		for (const membership of this.stored.values()) {
			if (membership.tenantId === tenantId && membership.userId === userId && membership.isActive()) return membership;
		}
		return null;
	}

	async findActiveByEmail(tenantId: TenantId, email: Email): Promise<Membership | null> {
		const user = await this.users.findByEmail(email);
		return user ? this.findActive(tenantId, user.id) : null;
	}

	ownerCounts = 0;

	async countActiveOwners(tenantId: TenantId): Promise<number> {
		this.ownerCounts++;
		return [...this.stored.values()].filter((m) => m.tenantId === tenantId && m.role === "owner" && m.isActive()).length;
	}

	async insert(membership: Membership): Promise<void> {
		this.stored.set(membership.id, membership);
	}

	async update(membership: Membership): Promise<void> {
		this.stored.set(membership.id, membership);
	}
}
