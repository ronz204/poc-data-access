import { sql } from "drizzle-orm";
import { index, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ColumnsHelper } from "@db/helpers/column.helper";
import { EnumsHelper } from "@db/helpers/options.helper";
import { platform } from "@db/helpers/existing.helper";
import { tenants } from "./tenants.model";
import { users } from "./users.model";

const ROLES = ["owner", "admin", "member"] as const;

export const memberships = platform.table(
	"memberships",
	{
		id: ColumnsHelper.id(),
		tenantId: ColumnsHelper.tenant().references(() => tenants.id),
		userId: ColumnsHelper.reference("user_id", () => users.id),
		role: text("role", { enum: ROLES }).notNull(),
		createdAt: ColumnsHelper.createdAt(),
		removedAt: ColumnsHelper.instant("removed_at"),
	},
	(table) => [
		uniqueIndex("memberships_tenant_id_user_id_active_idx")
			.on(table.tenantId, table.userId)
			.where(sql`${table.removedAt} is null`),
		index("memberships_user_id_idx").on(table.userId),
		EnumsHelper.check("memberships_role_check", table.role, ROLES),
	],
);
