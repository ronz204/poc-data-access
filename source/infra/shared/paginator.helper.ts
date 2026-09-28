import type { Cursor, Direction, Page, Paging } from "@app/shared/paging.type";
import { asc, desc, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

export class Paginator {
	static after(
		table: AnyPgTable,
		key: AnyPgColumn,
		column: AnyPgColumn,
		direction: Direction,
		paging: Paging,
	): SQL | undefined {
		if (!paging.after) return undefined;

		const pivot = sql`(select ${column} from ${table} where ${key} = ${paging.after})`;
		return direction === "asc"
			? sql`(${column}, ${key}) > (${pivot}, ${paging.after})`
			: sql`(${column}, ${key}) < (${pivot}, ${paging.after})`;
	}

	static order(key: AnyPgColumn, column: AnyPgColumn, direction: Direction): SQL[] {
		const by = direction === "asc" ? asc : desc;
		return [by(column), by(key)];
	}

	static page<Item extends { readonly id: string }>(
		rows: readonly Item[],
		limit: number,
	): Page<Item> {
		const items = rows.slice(0, limit);
		const last = items.at(-1);
		return { items, next: rows.length > limit && last ? (last.id as Cursor) : null };
	}
}
