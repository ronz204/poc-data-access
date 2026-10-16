import { type AnyPgColumn, pgPolicy } from "drizzle-orm/pg-core";
import { PoliciesHelper } from "@db/helpers/policies.helper";
import { runner } from "@db/helpers/existing.helper";
import { sql } from "drizzle-orm";

export class AuditrailPolicy {
	static rules(tenantId: AnyPgColumn, actorId: AnyPgColumn, origin: AnyPgColumn) {
		return [
			pgPolicy("trailer_select_policy", {
				for: "select",
				to: runner,
				using: sql`${tenantId} = ${PoliciesHelper.tenant()}`,
			}),
			pgPolicy("trailer_insert_policy", {
				for: "insert",
				to: runner,
				withCheck: sql`${tenantId} is not distinct from ${PoliciesHelper.tenant()}
					and ${actorId} is not distinct from ${PoliciesHelper.actor()}
					and ${origin} = ${PoliciesHelper.origin()}`,
			}),
		];
	};
};
