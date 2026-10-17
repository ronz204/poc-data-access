import { ListInvitesInput, toListInvitesCommand } from "@app/identity-access/list-invites/list-invites.schema";
import { Cursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@core/shared-kernel";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("ListInvitesInput", () => {
	it("accepts an empty body and bounds the page size", () => {
		expect(ListInvitesInput.safeParse({}).success).toBe(true);
		expect(ListInvitesInput.safeParse({ pageSize: MAX_PAGE_SIZE }).success).toBe(true);
		expect(ListInvitesInput.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
		expect(ListInvitesInput.safeParse({ pageSize: 0 }).success).toBe(false);
		expect(ListInvitesInput.safeParse({ pageSize: 1.5 }).success).toBe(false);
	});
});

describe("toListInvitesCommand", () => {
	it("starts at the first page with the default size", () => {
		expect(toListInvitesCommand({})).toEqual({ after: null, pageSize: DEFAULT_PAGE_SIZE });
	});

	it("decodes the cursor", () => {
		const key = { createdAt: new Date("2026-03-01T00:00:00.000Z"), id: "0192f3a4-5b6c-7d8e-9f01-23456789abcd" };
		expect(toListInvitesCommand({ cursor: Cursor.encode(key), pageSize: 3 })).toEqual({ after: key, pageSize: 3 });
	});

	it("rejects a cursor this list did not issue", () => {
		expectDomainError(() => toListInvitesCommand({ cursor: "garbage" }), "invalid_cursor");
	});
});
