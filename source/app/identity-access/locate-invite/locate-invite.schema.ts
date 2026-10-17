import { z } from "zod";

export const LocateInviteInput = z.object({
	token: z.string().min(1).max(200),
});
export type LocateInviteInput = z.infer<typeof LocateInviteInput>;

export interface LocateInviteCommand {
	readonly token: string;
}

export const toLocateInviteCommand = (input: LocateInviteInput): LocateInviteCommand => ({ token: input.token });

export const LocateInviteOutput = z.object({ tenantId: z.uuid() });
export type LocateInviteOutput = z.infer<typeof LocateInviteOutput>;
