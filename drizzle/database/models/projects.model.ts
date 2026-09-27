import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { tenants } from "@db/models/tenants.model";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import { foreignKey, index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const ProjectConstraints = {
	slug: "projects_tenant_id_slug_key",
	tenantScopedId: "projects_tenant_id_id_key",
	tenant: "projects_tenant_id_tenants_id_fkey",
} as const;

export const projects = core.table(
	"projects",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		tenantId: uuid("tenant_id").notNull(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		unique(ProjectConstraints.slug).on(t.tenantId, t.slug),
		unique(ProjectConstraints.tenantScopedId).on(t.tenantId, t.id),
		foreignKey({
			name: ProjectConstraints.tenant,
			columns: [t.tenantId],
			foreignColumns: [tenants.id],
		}).onDelete("cascade"),
		index("projects_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
		IsolationPolicy.tenant(t.tenantId),
	],
);
