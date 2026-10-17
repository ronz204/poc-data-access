import { type IInvitationRepository, type Invitation, InvitationError, type InvitationId, type TokenHash } from "@core/identity-access";
import type { Email, TenantId } from "@core/shared-kernel";

export class InMemoryInvitationRepository implements IInvitationRepository {
	readonly stored = new Map<InvitationId, Invitation>();

	async findById(tenantId: TenantId, id: InvitationId): Promise<Invitation | null> {
		const found = this.stored.get(id);
		return found && found.tenantId === tenantId ? found : null;
	}

	async findByTokenHash(tokenHash: TokenHash): Promise<Invitation | null> {
		return [...this.stored.values()].find((invitation) => invitation.tokenHash === tokenHash) ?? null;
	}

	async findPending(tenantId: TenantId, email: Email): Promise<Invitation | null> {
		return (
			[...this.stored.values()].find(
				(invitation) => invitation.tenantId === tenantId && invitation.email === email && invitation.isPending(),
			) ?? null
		);
	}

	async insert(invitation: Invitation): Promise<void> {
		if (invitation.isPending() && (await this.findPending(invitation.tenantId, invitation.email))) {
			throw new InvitationError("invitation_pending");
		}
		this.stored.set(invitation.id, invitation);
	}

	async update(invitation: Invitation): Promise<void> {
		this.stored.set(invitation.id, invitation);
	}
}
