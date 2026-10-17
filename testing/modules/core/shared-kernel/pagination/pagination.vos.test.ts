import { Cursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@core/shared-kernel";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const key = { createdAt: new Date("2026-03-01T10:20:30.123Z"), id: "0192f3a4-5b6c-7d8e-9f01-23456789abcd" };

describe("Cursor", () => {
	it("round trips a sort key", () => {
		expect(Cursor.decode(Cursor.encode(key))).toEqual(key);
	});

	it("is url safe and opaque", () => {
		const cursor = Cursor.encode(key);
		expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(cursor).not.toContain(key.id);
	});

	it.each(["", "not a cursor", "!!!", btoa("no-separator"), btoa("not-a-date|id"), btoa("2026-03-01T00:00:00.000Z|a|b")])(
		"rejects %j",
		(value) => {
			expectDomainError(() => Cursor.decode(value), "invalid_cursor");
		},
	);
});

describe("page size bounds", () => {
	it("keeps the default within the maximum", () => {
		expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
	});
});
