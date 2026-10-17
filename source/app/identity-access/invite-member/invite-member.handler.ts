import {
	type IInvitationRepository,
	type IMembershipRepository,
	type IUserRepository,
	Invitation,
	InvitationError,
	InvitationId,
	InvitationPolicy,
	TokenHash,
} from "@core/identity-access";
import type { Clock, HashToken, NewId, NewToken } from "@keys/system.dockey";
import type { InviteMemberCommand, InviteMemberOutput } from "./invite-member.schema";
import { AdmissionError } from "@core/shared-kernel";
import { toInvitationView } from "../identity-access.views";
import type { RunContext } from "@dal/dal.contexter";

export class InviteMemberHandler {
	constructor(
		private readonly users: IUserRepository,
		private readonly memberships: IMembershipRepository,
		private readonly invitations: IInvitationRepository,
		private readonly context: RunContext,
		private readonly now: Clock,
		private readonly newId: NewId,
		private readonly newToken: NewToken,
		private readonly hashToken: HashToken,
	) {}

	async execute(command: InviteMemberCommand): Promise<InviteMemberOutput> {
		const tenantId = this.context.tenant;
		const now = this.now();

		const actor = await this.memberships.findActive(tenantId, this.context.actor);
		if (!actor) throw new AdmissionError("not_a_member");
		InvitationPolicy.assertCanInvite(actor.role, command.role);

		const existing = await this.users.findByEmail(command.email);
		if (existing && (await this.memberships.findActive(tenantId, existing.id))) {
			throw new InvitationError("already_member");
		}

		const pending = await this.invitations.findPending(tenantId, command.email);
		if (pending) {
			if (!pending.isExpired(now)) throw new InvitationError("invitation_pending");
			await this.invitations.update(pending.revoke());
		}

		const token = this.newToken();
		const invitation = Invitation.issue(
			{
				id: InvitationId.parse(this.newId()),
				tenantId,
				invitedBy: actor.userId,
				email: command.email,
				role: command.role,
				tokenHash: TokenHash.parse(this.hashToken(token)),
			},
			now,
		);
		await this.invitations.insert(invitation);

		return { ...toInvitationView(invitation), token };
	}
}
