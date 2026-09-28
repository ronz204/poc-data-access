import type { Brand } from "@core/shared/brand.type";

export type Direction = "asc" | "desc";

export interface Sorting<Field extends string> {
	readonly field: Field;
	readonly direction: Direction;
}

export type Cursor = Brand<string, "Cursor">;

export interface Paging {
	readonly limit: number;
	readonly after?: Cursor;
}

export interface Page<Item> {
	readonly items: readonly Item[];
	readonly next: Cursor | null;
}
