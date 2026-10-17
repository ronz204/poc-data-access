import type { MembershipRole } from "@core/shared-kernel";
import type { Invitation } from "./invitation.aggregate";
import { InvitationError } from "./invitation.errors";
import type { InvitationRole } from "./invitation.vos";

export class InvitationPolicy {
	static assertCanInvite(actor: MembershipRole, role: InvitationRole): void {
		if (actor === "owner" || (actor === "admin" && role === "member")) return;
		throw new InvitationError("insufficient_role");
	}

	static assertCanRevoke(actor: MembershipRole, invitation: Invitation): void {
		if (actor === "owner" || (actor === "admin" && invitation.role === "member")) return;
		throw new InvitationError("insufficient_role");
	}

	static assertCanList(actor: MembershipRole): void {
		if (actor === "member") throw new InvitationError("insufficient_role");
	}
}
