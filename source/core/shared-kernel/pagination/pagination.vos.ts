import type { CursorKey } from "./pagination.contracts";
import { PaginationError } from "./pagination.errors";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

const toBase64Url = (text: string) => btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const fromBase64Url = (text: string) => atob(text.replaceAll("-", "+").replaceAll("_", "/"));

export const Cursor = Object.freeze({
	encode(key: CursorKey): string {
		return toBase64Url(`${key.createdAt.toISOString()}|${key.id}`);
	},

	decode(value: string): CursorKey {
		try {
			const [instant, id, ...rest] = fromBase64Url(value).split("|");
			const createdAt = new Date(instant ?? "");
			if (!id || rest.length || Number.isNaN(createdAt.getTime())) throw new PaginationError("invalid_cursor");
			return { createdAt, id };
		} catch {
			throw new PaginationError("invalid_cursor");
		}
	},
});
