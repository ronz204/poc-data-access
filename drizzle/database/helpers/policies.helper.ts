import { type SQL, sql } from "drizzle-orm";

export class PoliciesHelper {
	static readonly actorKey = "app.actor";
	static readonly tenantKey = "app.tenant";
	static readonly originKey = "app.origin";

	static setting(key: string): SQL {
		return sql.raw(`nullif(current_setting('${key}', true), '')`);
	};

	static tenant = () => sql`${PoliciesHelper.setting(PoliciesHelper.tenantKey)}::uuid`;
	static actor = () => sql`${PoliciesHelper.setting(PoliciesHelper.actorKey)}::uuid`;
	static origin = () => PoliciesHelper.setting(PoliciesHelper.originKey);
};
