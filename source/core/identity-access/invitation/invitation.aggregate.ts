import { type Email, Entity, type EntityState, type TenantId, type UserId } from "@core/shared-kernel";
import type { InvitationId, InvitationRole, InvitationStatus, TokenHash } from "./invitation.vos";
import { InvitationError } from "./invitation.errors";

const TIME_TO_LIVE_MS = 7 * 24 * 60 * 60 * 1000;

export interface InvitationState extends EntityState<InvitationId> {
	readonly tenantId: TenantId;
	readonly invitedBy: UserId;
	readonly email: Email;
	readonly role: InvitationRole;
	readonly tokenHash: TokenHash;
	readonly status: InvitationStatus;
	readonly expiresAt: Date;
	readonly createdAt: Date;
	readonly acceptedAt: Date | null;
}

export type InvitationIssueInput = Pick<
	InvitationState,
	"id" | "tenantId" | "invitedBy" | "email" | "role" | "tokenHash"
>;

export class Invitation extends Entity<InvitationState>() {
	private constructor(state: InvitationState) {
		super(state);
	}

	static issue(input: InvitationIssueInput, now: Date): Invitation {
		return new Invitation({
			...input,
			status: "pending",
			expiresAt: new Date(now.getTime() + TIME_TO_LIVE_MS),
			createdAt: now,
			acceptedAt: null,
		});
	}

	isPending(): boolean {
		return this.status === "pending";
	}

	isExpired(now: Date): boolean {
		return this.expiresAt.getTime() <= now.getTime();
	}

	accept(now: Date): Invitation {
		if (!this.isPending() || this.isExpired(now)) throw new InvitationError("invitation_invalid");
		return this.with({ status: "accepted", acceptedAt: now });
	}

	revoke(): Invitation {
		if (!this.isPending()) throw new InvitationError("not_pending");
		return this.with({ status: "revoked" });
	}
}
