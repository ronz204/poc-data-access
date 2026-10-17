import { TenantName } from "@core/identity-access";
import { MembershipView } from "../identity-access.views";
import { z } from "zod";

export const CreateTenantInput = z.object({
	name: z.string().max(200),
});
export type CreateTenantInput = z.infer<typeof CreateTenantInput>;

export interface CreateTenantCommand {
	readonly name: TenantName;
}

export const toCreateTenantCommand = (input: CreateTenantInput): CreateTenantCommand => ({
	name: TenantName.parse(input.name),
});

export const CreateTenantOutput = z.object({
	id: z.uuid(),
	name: z.string(),
	createdAt: z.iso.datetime(),
	ownerMembership: MembershipView,
});
export type CreateTenantOutput = z.infer<typeof CreateTenantOutput>;
