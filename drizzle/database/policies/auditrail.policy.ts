import { runner } from "@db/helpers/existing.helper";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgPolicy } from "drizzle-orm/pg-core";

export class AuditrailPolicy {
	static appendOnly(tenantId: AnyPgColumn) {
		const current = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

		return [
			pgPolicy("auditrail_insert", {
				as: "permissive",
				for: "insert",
				to: runner,
				withCheck: sql`${tenantId} is not distinct from ${current}`,
			}),
			pgPolicy("auditrail_select", {
				as: "permissive",
				for: "select",
				to: runner,
				using: sql`${tenantId} = ${current}`,
			}),
		];
	}
}
