import { InvitationId } from "@core/identity-access";
import { z } from "zod";

export const RevokeInviteInput = z.object({
	id: z.string().max(36),
});
export type RevokeInviteInput = z.infer<typeof RevokeInviteInput>;

export interface RevokeInviteCommand {
	readonly id: InvitationId;
}

export const toRevokeInviteCommand = (input: RevokeInviteInput): RevokeInviteCommand => ({
	id: InvitationId.parse(input.id),
});
