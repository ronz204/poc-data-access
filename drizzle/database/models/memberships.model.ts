import { core } from "@db/helpers/existing.helper";
import { tenants } from "@db/models/tenants.model";
import { users } from "@db/models/users.model";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import { index, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

export const memberRole = core.enum("member_role", [
	"owner",
	"admin",
	"member",
]);

export const memberships = core.table(
	"memberships",
	{
		tenantId: uuid("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: memberRole("role").notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.tenantId, t.userId] }),
		// la PK ya indexa por tenant_id; éste cubre "¿a qué tenants pertenece este usuario?"
		index("memberships_user_id_idx").on(t.userId),
		IsolationPolicy.tenant(t.tenantId),
	],
);
