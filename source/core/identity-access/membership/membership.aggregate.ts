import { Entity, type EntityState, type MembershipRole, type TenantId, type UserId } from "@core/shared-kernel";
import type { MembershipId } from "./membership.vos";

export interface MembershipState extends EntityState<MembershipId> {
	readonly tenantId: TenantId;
	readonly userId: UserId;
	readonly role: MembershipRole;
	readonly createdAt: Date;
	readonly removedAt: Date | null;
}

export type MembershipEnrollOwnerInput = Pick<MembershipState, "id" | "tenantId" | "userId">;

export type MembershipJoinInput = Pick<MembershipState, "id" | "tenantId" | "userId" | "role">;

export class Membership extends Entity<MembershipState>() {
	private constructor(state: MembershipState) {
		super(state);
	}

	static enrollOwner(input: MembershipEnrollOwnerInput, now: Date): Membership {
		return new Membership({ ...input, role: "owner", createdAt: now, removedAt: null });
	}

	static join(input: MembershipJoinInput, now: Date): Membership {
		return new Membership({ ...input, createdAt: now, removedAt: null });
	}

	isActive(): boolean {
		return this.removedAt === null;
	}

	isOwner(): boolean {
		return this.role === "owner";
	}

	changeRole(role: MembershipRole): Membership {
		return role === this.role ? this : this.with({ role });
	}

	remove(now: Date): Membership {
		return this.with({ removedAt: now });
	}
}
