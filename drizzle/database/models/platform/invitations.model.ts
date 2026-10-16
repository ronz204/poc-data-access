import { sql } from "drizzle-orm";
import { index, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ColumnsHelper } from "@db/helpers/column.helper";
import { EnumsHelper } from "@db/helpers/options.helper";
import { platform } from "@db/helpers/existing.helper";
import { tenants } from "./tenants.model";
import { users } from "./users.model";

const ROLES = ["admin", "member"] as const;
const STATUSES = ["pending", "accepted", "revoked"] as const;

export const invitations = platform.table(
	"invitations",
	{
		id: ColumnsHelper.id(),
		tenantId: ColumnsHelper.tenant().references(() => tenants.id),
		invitedBy: ColumnsHelper.reference("invited_by", () => users.id),
		email: text("email").notNull(),
		role: text("role", { enum: ROLES }).notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		status: text("status", { enum: STATUSES }).notNull(),
		expiresAt: ColumnsHelper.instant("expires_at").notNull(),
		createdAt: ColumnsHelper.createdAt(),
		acceptedAt: ColumnsHelper.instant("accepted_at"),
	},
	(table) => [
		index("invitations_tenant_id_created_at_id_idx").on(table.tenantId, table.createdAt, table.id),
		uniqueIndex("invitations_tenant_id_email_pending_idx")
			.on(table.tenantId, table.email)
			.where(sql`${table.status} = 'pending'`),
		EnumsHelper.check("invitations_role_check", table.role, ROLES),
		EnumsHelper.check("invitations_status_check", table.status, STATUSES),
	],
);
