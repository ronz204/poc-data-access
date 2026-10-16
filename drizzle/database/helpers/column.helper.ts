import { type AnyPgColumn, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

export class ColumnsHelper {
	static id = () => uuid("id").primaryKey().$defaultFn(uuidv7);
	static tenant = () => uuid("tenant_id").notNull();
	static instant = (name: string) => timestamp(name, { withTimezone: true });
	static createdAt = () => ColumnsHelper.instant("created_at").notNull();
	static reference = (name: string, target: () => AnyPgColumn) => uuid(name).notNull().references(target);
};
