import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = core.table("users", {
	id: uuid("id").primaryKey().$defaultFn(generateId),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	passwordHash: text("password_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
