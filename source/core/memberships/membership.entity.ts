import type { UserId } from "@core/users/user.ids";

export type MemberRole = "owner" | "admin" | "member";

export interface MembershipSnapshot {
	readonly userId: UserId;
	readonly role: MemberRole;
	readonly createdAt: Date;
}

export class Membership {
	private constructor(private readonly state: MembershipSnapshot) {}

	static create(userId: UserId, role: MemberRole): Membership {
		return new Membership({ userId, role, createdAt: new Date() });
	}

	snapshot(): MembershipSnapshot {
		return this.state;
	}
}
