import { InvitationId, InvitationRole, InvitationStatus } from "@core/identity-access";
import { Cursor, type CursorKey, Email, type Page, type TenantId, UserId } from "@core/shared-kernel";
import { invitations } from "@db/models/platform/invitations.model";
import type { RunExecutor } from "@dal/dal.transactor";
import { and, asc, eq, sql } from "drizzle-orm";

export interface InvitationListView {
	readonly id: InvitationId;
	readonly invitedBy: UserId;
	readonly email: Email;
	readonly role: InvitationRole;
	readonly status: InvitationStatus;
	readonly expiresAt: Date;
	readonly createdAt: Date;
	readonly acceptedAt: Date | null;
}

export class InvitationsPageQuery {
	constructor(private readonly executor: RunExecutor) {}

	async execute(tenantId: TenantId, after: CursorKey | null, pageSize: number): Promise<Page<InvitationListView>> {
		const rows = await this.executor
			.select({
				id: invitations.id,
				invitedBy: invitations.invitedBy,
				email: invitations.email,
				role: invitations.role,
				status: invitations.status,
				expiresAt: invitations.expiresAt,
				createdAt: invitations.createdAt,
				acceptedAt: invitations.acceptedAt,
			})
			.from(invitations)
			.where(
				and(
					eq(invitations.tenantId, tenantId),
					after ? sql`(${invitations.createdAt}, ${invitations.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)` : undefined,
				),
			)
			.orderBy(asc(invitations.createdAt), asc(invitations.id))
			.limit(pageSize + 1);

		const items = rows.slice(0, pageSize).map(
			(row): InvitationListView => ({
				id: InvitationId.parse(row.id),
				invitedBy: UserId.parse(row.invitedBy),
				email: Email.parse(row.email),
				role: InvitationRole.parse(row.role),
				status: InvitationStatus.parse(row.status),
				expiresAt: row.expiresAt,
				createdAt: row.createdAt,
				acceptedAt: row.acceptedAt,
			}),
		);
		const last = items.at(-1);

		return { items, nextCursor: rows.length > pageSize && last ? Cursor.encode({ createdAt: last.createdAt, id: last.id }) : null };
	}
}
