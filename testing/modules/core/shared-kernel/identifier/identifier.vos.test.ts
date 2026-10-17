import { TenantId, UserId } from "@core/shared-kernel";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const VALID_UUID = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";

describe("shared identifiers", () => {
	it("declares one kind per identifier", () => {
		expect(UserId.kind).toBe("UserId");
		expect(TenantId.kind).toBe("TenantId");
	});

	it("parses to the same lowercase uuid", () => {
		expect(UserId.parse(VALID_UUID.toUpperCase())).toBe(VALID_UUID);
		expect(TenantId.parse(VALID_UUID)).toBe(VALID_UUID);
	});

	it("names the offending kind in the failure details", () => {
		expectDomainError(() => UserId.parse("x"), "invalid_identifier", { kind: "UserId" });
		expectDomainError(() => TenantId.parse("x"), "invalid_identifier", { kind: "TenantId" });
	});
});
