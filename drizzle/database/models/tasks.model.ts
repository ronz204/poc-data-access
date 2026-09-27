import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { projects } from "@db/models/projects.model";
import { tenants } from "@db/models/tenants.model";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import {
	boolean,
	foreignKey,
	index,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const tasks = core.table(
	"tasks",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		tenantId: uuid("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		projectId: uuid("project_id").notNull(),
		title: text("title").notNull(),
		done: boolean("done").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		foreignKey({
			name: "tasks_tenant_id_project_id_fkey",
			columns: [t.tenantId, t.projectId],
			foreignColumns: [projects.tenantId, projects.id],
		}).onDelete("cascade"),
		index("tasks_tenant_id_project_id_idx").on(t.tenantId, t.projectId),
		index("tasks_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
		IsolationPolicy.tenant(t.tenantId),
	],
);
