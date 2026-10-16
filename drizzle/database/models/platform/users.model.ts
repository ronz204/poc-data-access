import { text } from "drizzle-orm/pg-core";
import { ColumnsHelper } from "@db/helpers/column.helper";
import { platform } from "@db/helpers/existing.helper";

export const users = platform.table("users", {
	id: ColumnsHelper.id(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	createdAt: ColumnsHelper.createdAt(),
});
