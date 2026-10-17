import { RemoveMemberInput, toRemoveMemberCommand } from "@app/identity-access/remove-member/remove-member.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const USER = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";

describe("RemoveMemberInput", () => {
	it("accepts a well formed body and rejects a malformed one", () => {
		expect(RemoveMemberInput.safeParse({ userId: USER }).success).toBe(true);
		expect(RemoveMemberInput.safeParse({}).success).toBe(false);
		expect(RemoveMemberInput.safeParse({ userId: 1 }).success).toBe(false);
	});
});

describe("toRemoveMemberCommand", () => {
	it("builds a domain id and rejects a malformed one", () => {
		expect(toRemoveMemberCommand({ userId: USER })).toEqual({ userId: USER });
		expectDomainError(() => toRemoveMemberCommand({ userId: "nope" }), "invalid_identifier");
	});
});
