import { runner } from "@db/helpers/existing.helper";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgPolicy } from "drizzle-orm/pg-core";

export class IsolationPolicy {
	static tenant(tenantId: AnyPgColumn) {
		const predicate = sql`${tenantId} = current_setting('app.tenant_id', true)::uuid`;

		return pgPolicy("tenant_isolation", {
			as: "permissive",
			for: "all",
			to: runner,
			using: predicate,
			withCheck: predicate,
		});
	}
}
