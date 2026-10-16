import { text } from "drizzle-orm/pg-core";
import { ColumnsHelper } from "@db/helpers/column.helper";
import { platform } from "@db/helpers/existing.helper";

export const tenants = platform.table("tenants", {
	id: ColumnsHelper.id(),
	name: text("name").notNull(),
	createdAt: ColumnsHelper.createdAt(),
});
