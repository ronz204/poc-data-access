import { index, primaryKey, text } from "drizzle-orm/pg-core";
import { ColumnsHelper } from "@db/helpers/column.helper";
import { EnumsHelper } from "@db/helpers/options.helper";
import { platform } from "@db/helpers/existing.helper";
import { tenants } from "./tenants.model";
import { users } from "./users.model";

const ROLES = ["owner", "admin", "member"] as const;

export const memberships = platform.table(
	"memberships",
	{
		tenantId: ColumnsHelper.tenant().references(() => tenants.id),
		userId: ColumnsHelper.reference("user_id", () => users.id),
		role: text("role", { enum: ROLES }).notNull(),
		createdAt: ColumnsHelper.createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.tenantId, table.userId] }),
		index("memberships_user_id_idx").on(table.userId),
		EnumsHelper.check("memberships_role_check", table.role, ROLES),
	],
);
