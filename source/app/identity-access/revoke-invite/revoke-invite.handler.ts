import { type IInvitationRepository, type IMembershipRepository, InvitationError, InvitationPolicy } from "@core/identity-access";
import { type InvitationView, toInvitationView } from "../identity-access.views";
import type { RevokeInviteCommand } from "./revoke-invite.schema";
import { AdmissionError } from "@core/shared-kernel";
import type { RunContext } from "@dal/dal.contexter";

export class RevokeInviteHandler {
	constructor(
		private readonly memberships: IMembershipRepository,
		private readonly invitations: IInvitationRepository,
		private readonly context: RunContext,
	) {}

	async execute(command: RevokeInviteCommand): Promise<InvitationView> {
		const tenantId = this.context.tenant;

		const actor = await this.memberships.findActive(tenantId, this.context.actor);
		if (!actor) throw new AdmissionError("not_a_member");

		const invitation = await this.invitations.findById(tenantId, command.id);
		if (!invitation) throw new InvitationError("invitation_not_found");
		InvitationPolicy.assertCanRevoke(actor.role, invitation);

		const revoked = invitation.revoke();
		await this.invitations.update(revoked);
		return toInvitationView(revoked);
	}
}
