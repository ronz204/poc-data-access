import { ChangeRoleInput, toChangeRoleCommand } from "@app/identity-access/change-role/change-role.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const USER = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";

describe("ChangeRoleInput", () => {
	it("accepts a well formed body", () => {
		expect(ChangeRoleInput.safeParse({ userId: USER, role: "admin" }).success).toBe(true);
	});

	it.each([{}, { userId: USER }, { role: "admin" }, { userId: 1, role: "admin" }])("rejects the shape %j", (body) => {
		expect(ChangeRoleInput.safeParse(body).success).toBe(false);
	});
});

describe("toChangeRoleCommand", () => {
	it("builds domain values", () => {
		expect(toChangeRoleCommand({ userId: USER.toUpperCase(), role: "admin" })).toEqual({ userId: USER, role: "admin" });
	});

	it("raises invalid_identifier for a malformed user id", () => {
		expectDomainError(() => toChangeRoleCommand({ userId: "nope", role: "admin" }), "invalid_identifier");
	});

	it("raises invalid_literal for an unknown role", () => {
		expectDomainError(() => toChangeRoleCommand({ userId: USER, role: "boss" }), "invalid_literal");
	});
});
