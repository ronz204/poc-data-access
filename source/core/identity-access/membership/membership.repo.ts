import type { Membership } from "./membership.aggregate";

export interface IMembershipRepository {
	insert(membership: Membership): Promise<void>;
}
