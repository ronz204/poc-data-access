import { InvitationView } from "../identity-access.views";
import { InvitationRole } from "@core/identity-access";
import { Email } from "@core/shared-kernel";
import { z } from "zod";

export const InviteMemberInput = z.object({
	email: z.string().max(320),
	role: z.string().max(20),
});
export type InviteMemberInput = z.infer<typeof InviteMemberInput>;

export interface InviteMemberCommand {
	readonly email: Email;
	readonly role: InvitationRole;
}

export const toInviteMemberCommand = (input: InviteMemberInput): InviteMemberCommand => ({
	email: Email.parse(input.email),
	role: InvitationRole.parse(input.role),
});

export const InviteMemberOutput = InvitationView.extend({ token: z.string() });
export type InviteMemberOutput = z.infer<typeof InviteMemberOutput>;
