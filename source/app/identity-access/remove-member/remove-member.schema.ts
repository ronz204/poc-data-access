import { UserId } from "@core/shared-kernel";
import { z } from "zod";

export const RemoveMemberInput = z.object({
	userId: z.string().max(36),
});
export type RemoveMemberInput = z.infer<typeof RemoveMemberInput>;

export interface RemoveMemberCommand {
	readonly userId: UserId;
}

export const toRemoveMemberCommand = (input: RemoveMemberInput): RemoveMemberCommand => ({
	userId: UserId.parse(input.userId),
});
