import {
	type IInvitationRepository,
	type IMembershipRepository,
	type ITokenVault,
	Invitation,
	InvitationError,
	InvitationId,
	InvitationPolicy,
} from "@core/identity-access";
import type { InviteMemberCommand, InviteMemberOutput } from "./invite-member.schema";
import type { Clock, NewId } from "@keys/system.dockey";
import { AdmissionError } from "@core/shared-kernel";
import { toInvitationView } from "../identity-access.views";
import type { RunContext } from "@dal/dal.contexter";

export class InviteMemberHandler {
	constructor(
		private readonly memberships: IMembershipRepository,
		private readonly invitations: IInvitationRepository,
		private readonly context: RunContext,
		private readonly now: Clock,
		private readonly newId: NewId,
		private readonly tokens: ITokenVault,
	) {}

	async execute(command: InviteMemberCommand): Promise<InviteMemberOutput> {
		const tenantId = this.context.tenant;
		const now = this.now();

		const actor = await this.memberships.findActive(tenantId, this.context.actor);
		if (!actor) throw new AdmissionError("not_a_member");
		InvitationPolicy.assertCanInvite(actor.role, command.role);

		if (await this.memberships.findActiveByEmail(tenantId, command.email)) throw new InvitationError("already_member");

		const pending = await this.invitations.findPending(tenantId, command.email);
		if (pending) {
			if (!pending.isExpired(now)) throw new InvitationError("invitation_pending");
			await this.invitations.update(pending.revoke());
		}

		const { token, hash } = this.tokens.mint();
		const invitation = Invitation.issue(
			{
				id: InvitationId.parse(this.newId()),
				tenantId,
				invitedBy: actor.userId,
				email: command.email,
				role: command.role,
				tokenHash: hash,
			},
			now,
		);
		await this.invitations.insert(invitation);

		return { ...toInvitationView(invitation), token };
	}
}
