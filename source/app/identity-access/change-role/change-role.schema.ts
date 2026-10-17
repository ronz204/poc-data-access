import { MembershipRole, UserId } from "@core/shared-kernel";
import { z } from "zod";

export const ChangeRoleInput = z.object({
	userId: z.string().max(36),
	role: z.string().max(20),
});
export type ChangeRoleInput = z.infer<typeof ChangeRoleInput>;

export interface ChangeRoleCommand {
	readonly userId: UserId;
	readonly role: MembershipRole;
}

export const toChangeRoleCommand = (input: ChangeRoleInput): ChangeRoleCommand => ({
	userId: UserId.parse(input.userId),
	role: MembershipRole.parse(input.role),
});
