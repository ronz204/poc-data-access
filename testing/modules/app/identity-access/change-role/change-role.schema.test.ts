import { ChangeMemberRoleInput, toChangeMemberRoleCommand } from "@app/identity-access/change-member-role/change-member-role.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const USER = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";

describe("ChangeMemberRoleInput", () => {
	it("accepts a well formed body", () => {
		expect(ChangeMemberRoleInput.safeParse({ userId: USER, role: "admin" }).success).toBe(true);
	});

	it.each([{}, { userId: USER }, { role: "admin" }, { userId: 1, role: "admin" }])("rejects the shape %j", (body) => {
		expect(ChangeMemberRoleInput.safeParse(body).success).toBe(false);
	});
});

describe("toChangeMemberRoleCommand", () => {
	it("builds domain values", () => {
		expect(toChangeMemberRoleCommand({ userId: USER.toUpperCase(), role: "admin" })).toEqual({ userId: USER, role: "admin" });
	});

	it("raises invalid_identifier for a malformed user id", () => {
		expectDomainError(() => toChangeMemberRoleCommand({ userId: "nope", role: "admin" }), "invalid_identifier");
	});

	it("raises invalid_literal for an unknown role", () => {
		expectDomainError(() => toChangeMemberRoleCommand({ userId: USER, role: "boss" }), "invalid_literal");
	});
});
