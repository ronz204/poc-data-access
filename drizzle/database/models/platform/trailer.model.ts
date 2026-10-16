import { check, index, jsonb, text, uuid } from "drizzle-orm/pg-core";
import { AuditrailPolicy } from "@db/policies/auditrail.policy";
import { ColumnsHelper } from "@db/helpers/column.helper";
import { platform } from "@db/helpers/existing.helper";
import { tenants } from "./tenants.model";
import { sql } from "drizzle-orm";

export const trailer = platform.table.withRLS(
	"trailer",
	{
		id: ColumnsHelper.id(),
		tenantId: uuid("tenant_id").references(() => tenants.id),
		actorId: uuid("actor_id"),
		origin: text("origin").notNull(),
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: uuid("entity_id"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
		xactId: ColumnsHelper.xact("xact_id").notNull().default(sql`pg_current_xact_id()`),
		occurredAt: ColumnsHelper.instant("occurred_at").notNull().defaultNow(),
	},
	(table) => [
		index("trailer_tenant_id_occurred_at_id_idx").on(table.tenantId, table.occurredAt, table.id),
		check("trailer_action_check", sql`${table.action} ~ '^[a-z0-9_]+\\.[a-z0-9_]+$'`),
		check("trailer_origin_check", sql`${table.origin} ~ '^[a-z0-9_]+(:[a-z0-9_]+)?$'`),
		...AuditrailPolicy.rules(table.tenantId, table.actorId, table.origin),
	],
);
