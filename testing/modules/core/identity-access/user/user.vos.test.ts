import { UserName } from "@core/identity-access";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("UserName", () => {
	it("trims", () => {
		expect(UserName.parse("  Ana  ")).toBe("Ana");
	});

	it("keeps the case", () => {
		expect(UserName.parse("ANA")).toBe("ANA");
	});

	it.each(["", "   "])("rejects %j as invalid_name with its bounds", (value) => {
		expectDomainError(() => UserName.parse(value), "invalid_name", { minLength: 1, maxLength: 120 });
	});

	it("accepts 120 characters and rejects 121", () => {
		expect(UserName.parse("a".repeat(120))).toHaveLength(120);
		expectDomainError(() => UserName.parse("a".repeat(121)), "invalid_name");
	});
});
