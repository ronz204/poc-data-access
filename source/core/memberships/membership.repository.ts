import type { Membership } from "@core/memberships/membership.entity";

export interface MembershipRepository {
	add(membership: Membership): Promise<void>;
}
