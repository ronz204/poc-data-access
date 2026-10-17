import { type IInvitationRepository, type Invitation, InvitationError, type InvitationId, type TokenHash } from "@core/identity-access";
import { invitations } from "@db/models/platform/invitations.model";
import type { RunExecutor } from "@dal/dal.transactor";
import { ViolationTranslator } from "@dal/dal.translator";
import type { Email, TenantId } from "@core/shared-kernel";
import { InvitationMapper } from "./invitation.mapper";
import { and, eq } from "drizzle-orm";

export class InvitationRepository implements IInvitationRepository {
	constructor(private readonly executor: RunExecutor) {}

	async findById(tenantId: TenantId, id: InvitationId): Promise<Invitation | null> {
		const [row] = await this.executor
			.select()
			.from(invitations)
			.where(and(eq(invitations.tenantId, tenantId), eq(invitations.id, id)))
			.limit(1);
		return row ? InvitationMapper.toDomain(row) : null;
	}

	async findByTokenHash(tokenHash: TokenHash): Promise<Invitation | null> {
		const [row] = await this.executor.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1);
		return row ? InvitationMapper.toDomain(row) : null;
	}

	async findPending(tenantId: TenantId, email: Email): Promise<Invitation | null> {
		const [row] = await this.executor
			.select()
			.from(invitations)
			.where(and(eq(invitations.tenantId, tenantId), eq(invitations.email, email), eq(invitations.status, "pending")))
			.limit(1);
		return row ? InvitationMapper.toDomain(row) : null;
	}

	async insert(invitation: Invitation): Promise<void> {
		await ViolationTranslator.translate(this.executor.insert(invitations).values(InvitationMapper.toRow(invitation)), {
			invitations_tenant_id_email_pending_idx: () => new InvitationError("invitation_pending"),
		});
	}

	async update(invitation: Invitation): Promise<void> {
		const { status, acceptedAt } = InvitationMapper.toRow(invitation);
		await this.executor.update(invitations).set({ status, acceptedAt }).where(eq(invitations.id, invitation.id));
	}
}
