import { type IInvitationRepository, type ITokenVault, InvitationError } from "@core/identity-access";
import type { LocateInviteCommand, LocateInviteOutput } from "./locate-invite.schema";

export class LocateInviteHandler {
	constructor(
		private readonly invitations: IInvitationRepository,
		private readonly tokens: ITokenVault,
	) {}

	async execute(command: LocateInviteCommand): Promise<LocateInviteOutput> {
		const invitation = await this.invitations.findByTokenHash(this.tokens.hash(command.token));
		if (!invitation) throw new InvitationError("invitation_invalid");

		return { tenantId: invitation.tenantId };
	}
}
