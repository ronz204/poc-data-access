import type { Membership } from "@core/identity-access";
import { z } from "zod";

export const MembershipView = z.object({
	id: z.uuid(),
	tenantId: z.uuid(),
	userId: z.uuid(),
	role: z.string(),
	createdAt: z.iso.datetime(),
	removedAt: z.iso.datetime().nullable(),
});
export type MembershipView = z.infer<typeof MembershipView>;

export const toMembershipView = (membership: Membership): MembershipView => ({
	id: membership.id,
	tenantId: membership.tenantId,
	userId: membership.userId,
	role: membership.role,
	createdAt: membership.createdAt.toISOString(),
	removedAt: membership.removedAt?.toISOString() ?? null,
});
