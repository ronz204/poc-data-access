import type { Email, TenantId, UserId } from "@core/shared-kernel";
import type { Membership } from "./membership.aggregate";

export interface IMembershipRepository {
	findActive(tenantId: TenantId, userId: UserId): Promise<Membership | null>;
	findActiveByEmail(tenantId: TenantId, email: Email): Promise<Membership | null>;
	countActiveOwners(tenantId: TenantId): Promise<number>;
	insert(membership: Membership): Promise<void>;
	update(membership: Membership): Promise<void>;
}
