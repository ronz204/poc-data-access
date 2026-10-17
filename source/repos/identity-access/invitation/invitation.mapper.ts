import { Invitation, InvitationId, InvitationRole, InvitationStatus, TokenHash } from "@core/identity-access";
import type { invitations } from "@db/models/platform/invitations.model";
import { Email, TenantId, UserId } from "@core/shared-kernel";

type InvitationRow = typeof invitations.$inferSelect;

export class InvitationMapper {
	static toRow(invitation: Invitation): InvitationRow {
		return {
			id: invitation.id,
			tenantId: invitation.tenantId,
			invitedBy: invitation.invitedBy,
			email: invitation.email,
			role: invitation.role,
			tokenHash: invitation.tokenHash,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			createdAt: invitation.createdAt,
			acceptedAt: invitation.acceptedAt,
		};
	}

	static toDomain(row: InvitationRow): Invitation {
		return Invitation.restore({
			id: InvitationId.parse(row.id),
			tenantId: TenantId.parse(row.tenantId),
			invitedBy: UserId.parse(row.invitedBy),
			email: Email.parse(row.email),
			role: InvitationRole.parse(row.role),
			tokenHash: TokenHash.parse(row.tokenHash),
			status: InvitationStatus.parse(row.status),
			expiresAt: row.expiresAt,
			createdAt: row.createdAt,
			acceptedAt: row.acceptedAt,
		});
	}
}
