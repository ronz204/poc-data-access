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

export const InvitationView = z.object({
	id: z.uuid(),
	email: z.string(),
	role: z.string(),
	status: z.string(),
	expiresAt: z.iso.datetime(),
	createdAt: z.iso.datetime(),
	acceptedAt: z.iso.datetime().nullable(),
});
export type InvitationView = z.infer<typeof InvitationView>;

export interface InvitationSource {
	readonly id: string;
	readonly email: string;
	readonly role: string;
	readonly status: string;
	readonly expiresAt: Date;
	readonly createdAt: Date;
	readonly acceptedAt: Date | null;
}

export const toInvitationView = (invitation: InvitationSource): InvitationView => ({
	id: invitation.id,
	email: invitation.email,
	role: invitation.role,
	status: invitation.status,
	expiresAt: invitation.expiresAt.toISOString(),
	createdAt: invitation.createdAt.toISOString(),
	acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
});
