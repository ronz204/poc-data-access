import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { projects } from "@db/models/projects.model";
import { tenants } from "@db/models/tenants.model";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import { boolean, foreignKey, index, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const TaskConstraints = {
	tenant: "tasks_tenant_id_tenants_id_fkey",
	project: "tasks_tenant_id_project_id_fkey",
} as const;

export const tasks = core.table(
	"tasks",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		tenantId: uuid("tenant_id").notNull(),
		projectId: uuid("project_id").notNull(),
		title: text("title").notNull(),
		done: boolean("done").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		foreignKey({
			name: TaskConstraints.tenant,
			columns: [t.tenantId],
			foreignColumns: [tenants.id],
		}).onDelete("cascade"),
		foreignKey({
			name: TaskConstraints.project,
			columns: [t.tenantId, t.projectId],
			foreignColumns: [projects.tenantId, projects.id],
		}).onDelete("cascade"),
		index("tasks_tenant_id_project_id_idx").on(t.tenantId, t.projectId),
		index("tasks_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
		IsolationPolicy.tenant(t.tenantId),
	],
);
