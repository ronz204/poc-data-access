import { MembershipRole, UserId } from "@core/shared-kernel";
import { z } from "zod";

export const ChangeMemberRoleInput = z.object({
	userId: z.string().max(36),
	role: z.string().max(20),
});
export type ChangeMemberRoleInput = z.infer<typeof ChangeMemberRoleInput>;

export interface ChangeMemberRoleCommand {
	readonly userId: UserId;
	readonly role: MembershipRole;
}

export const toChangeMemberRoleCommand = (input: ChangeMemberRoleInput): ChangeMemberRoleCommand => ({
	userId: UserId.parse(input.userId),
	role: MembershipRole.parse(input.role),
});
