import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { IsolationPolicy } from "@db/policies/isolation.policy";
import { text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const TenantConstraints = {
	slug: "tenants_slug_key",
} as const;

export const tenantPlan = core.enum("tenant_plan", ["free", "pro"]);
export const tenantStatus = core.enum("tenant_status", ["active", "suspended"]);

export const tenants = core.table(
	"tenants",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		plan: tenantPlan("plan").notNull().default("free"),
		status: tenantStatus("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [unique(TenantConstraints.slug).on(t.slug), IsolationPolicy.tenant(t.id)],
);
