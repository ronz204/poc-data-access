import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { AuditrailPolicy } from "@db/policies/auditrail.policy";
import { sql } from "drizzle-orm";
import { bigint, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type AuditChanges = Record<string, readonly [before: unknown, after: unknown]>;

export const auditrail = core.table(
	"auditrail",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		tenantId: uuid("tenant_id"),
		actorId: uuid("actor_id"),
		action: text("action").notNull(),
		entity: text("entity").notNull(),
		entityId: uuid("entity_id"),
		changes: jsonb("changes").$type<AuditChanges>(),
		txid: bigint("txid", { mode: "number" }).notNull().default(sql`txid_current()`),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("auditrail_tenant_id_occurred_at_idx").on(t.tenantId, t.occurredAt),
		index("auditrail_actor_id_occurred_at_idx").on(t.actorId, t.occurredAt),
		index("auditrail_entity_entity_id_idx").on(t.entity, t.entityId),
		...AuditrailPolicy.appendOnly(t.tenantId),
	],
);
