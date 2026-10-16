import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, check } from "drizzle-orm/pg-core";

export class EnumsHelper {
	static within(values: readonly string[]): SQL {
		return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));
	};

	static check(name: string, column: AnyPgColumn, values: readonly string[]) {
		return check(name, sql`${column} IN (${EnumsHelper.within(values)})`);
	};
};
