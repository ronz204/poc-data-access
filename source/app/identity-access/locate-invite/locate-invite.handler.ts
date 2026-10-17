import { type IInvitationRepository, InvitationError, TokenHash } from "@core/identity-access";
import type { LocateInviteCommand, LocateInviteOutput } from "./locate-invite.schema";
import type { HashToken } from "@keys/system.dockey";

export class LocateInviteHandler {
	constructor(
		private readonly invitations: IInvitationRepository,
		private readonly hashToken: HashToken,
	) {}

	async execute(command: LocateInviteCommand): Promise<LocateInviteOutput> {
		const invitation = await this.invitations.findByTokenHash(TokenHash.parse(this.hashToken(command.token)));
		if (!invitation) throw new InvitationError("invitation_invalid");

		return { tenantId: invitation.tenantId };
	}
}
