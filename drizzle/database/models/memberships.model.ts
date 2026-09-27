import { core } from "@db/helpers/existing.helper";
import { tenants } from "@db/models/tenants.model";
import { users } from "@db/models/users.model";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import { foreignKey, index, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

export const MembershipConstraints = {
	pk: "memberships_pkey",
	tenant: "memberships_tenant_id_tenants_id_fkey",
	user: "memberships_user_id_users_id_fkey",
} as const;

export const memberRole = core.enum("member_role", ["owner", "admin", "member"]);

export const memberships = core.table(
	"memberships",
	{
		tenantId: uuid("tenant_id").notNull(),
		userId: uuid("user_id").notNull(),
		role: memberRole("role").notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ name: MembershipConstraints.pk, columns: [t.tenantId, t.userId] }),
		foreignKey({
			name: MembershipConstraints.tenant,
			columns: [t.tenantId],
			foreignColumns: [tenants.id],
		}).onDelete("cascade"),
		foreignKey({
			name: MembershipConstraints.user,
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete("cascade"),
		index("memberships_user_id_idx").on(t.userId),
		IsolationPolicy.tenant(t.tenantId),
	],
);
