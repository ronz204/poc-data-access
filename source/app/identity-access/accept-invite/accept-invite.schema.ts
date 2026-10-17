import { UserName } from "@core/identity-access";
import { z } from "zod";

export const AcceptInviteInput = z.object({
	token: z.string().min(1).max(200),
	name: z.string().max(200).optional(),
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteInput>;

export interface AcceptInviteCommand {
	readonly token: string;
	readonly name: UserName | null;
}

export const toAcceptInviteCommand = (input: AcceptInviteInput): AcceptInviteCommand => ({
	token: input.token,
	name: input.name === undefined ? null : UserName.parse(input.name),
});

export const AcceptInviteOutput = z.object({
	tenantId: z.uuid(),
	userId: z.uuid(),
	membershipId: z.uuid(),
	role: z.string(),
});
export type AcceptInviteOutput = z.infer<typeof AcceptInviteOutput>;
