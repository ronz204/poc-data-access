import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { tenants } from "@db/models/tenants.model";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import { index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const projects = core.table(
	"projects",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		tenantId: uuid("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("projects_tenant_id_slug_key").on(t.tenantId, t.slug),
		// destino de la FK compuesta de tasks: evita referencias entre tenants
		unique("projects_tenant_id_id_key").on(t.tenantId, t.id),
		index("projects_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
		IsolationPolicy.tenant(t.tenantId),
	],
);
