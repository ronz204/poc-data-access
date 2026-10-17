import { Membership, MembershipId, Tenant, TenantName } from "@core/identity-access";
import { InMemoryMembershipRepository, InMemoryTenantRepository } from "./tenant.memory";
import { type MembershipRole, TenantId, UserId } from "@core/shared-kernel";
import { RunContext } from "@dal/dal.contexter";

export const SEED_TIME = new Date("2026-01-01T00:00:00.000Z");
export const TENANT = TenantId.parse("0192f3a4-5b6c-7d8e-9f01-000000000001");

export const userOf = (n: number) => UserId.parse(`0192f3a4-5b6c-7d8e-9f01-1000000000${String(n).padStart(2, "0")}`);

export function seedTenant(roles: Readonly<Record<number, MembershipRole>>) {
	const tenants = new InMemoryTenantRepository();
	const memberships = new InMemoryMembershipRepository();
	tenants.stored.set(TENANT, Tenant.create({ id: TENANT, name: TenantName.parse("Acme") }, SEED_TIME));

	for (const [n, role] of Object.entries(roles)) {
		const userId = userOf(Number(n));
		const id = MembershipId.parse(`0192f3a4-5b6c-7d8e-9f01-2000000000${String(n).padStart(2, "0")}`);
		memberships.stored.set(id, Membership.restore({ id, tenantId: TENANT, userId, role, createdAt: SEED_TIME, removedAt: null }));
	}

	return { tenants, memberships };
}

export const asActor = (n: number) => RunContext.tenant(TENANT, userOf(n));
