import { generateId } from "@db/helpers/column.helper";
import { core } from "@db/helpers/existing.helper";
import { text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const UserConstraints = {
	email: "users_email_key",
} as const;

export const users = core.table(
	"users",
	{
		id: uuid("id").primaryKey().$defaultFn(generateId),
		email: text("email").notNull(),
		name: text("name").notNull(),
		passwordHash: text("password_hash").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [unique(UserConstraints.email).on(t.email)],
);
