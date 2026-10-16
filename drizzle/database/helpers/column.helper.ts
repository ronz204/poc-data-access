import { type AnyPgColumn, customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

const xid8 = customType<{ data: string }>({ dataType: () => "xid8" });

export class ColumnsHelper {
	static xact = (name: string) => xid8(name);
	static id = () => uuid("id").primaryKey().$defaultFn(uuidv7);
	static tenant = () => uuid("tenant_id").notNull();
	static instant = (name: string) => timestamp(name, { withTimezone: true });
	static createdAt = () => ColumnsHelper.instant("created_at").notNull();
	static reference = (name: string, target: () => AnyPgColumn) => uuid(name).notNull().references(target);
};
