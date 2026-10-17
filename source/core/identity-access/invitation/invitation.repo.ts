import type { Email, TenantId } from "@core/shared-kernel";
import type { Invitation } from "./invitation.aggregate";
import type { InvitationId, TokenHash } from "./invitation.vos";

export interface IInvitationRepository {
	findById(tenantId: TenantId, id: InvitationId): Promise<Invitation | null>;
	findByTokenHash(tokenHash: TokenHash): Promise<Invitation | null>;
	findPending(tenantId: TenantId, email: Email): Promise<Invitation | null>;
	insert(invitation: Invitation): Promise<void>;
	update(invitation: Invitation): Promise<void>;
}
