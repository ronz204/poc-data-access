import { CreateTenantInput, toCreateTenantCommand } from "@app/identity-access/create-tenant/create-tenant.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("CreateTenantInput", () => {
	it("accepts a well formed body", () => {
		expect(CreateTenantInput.safeParse({ name: "Acme" }).success).toBe(true);
	});

	it.each([{}, { name: 1 }, { name: null }])("rejects the shape %j", (body) => {
		expect(CreateTenantInput.safeParse(body).success).toBe(false);
	});

	it("bounds the wire length", () => {
		expect(CreateTenantInput.safeParse({ name: "n".repeat(200) }).success).toBe(true);
		expect(CreateTenantInput.safeParse({ name: "n".repeat(201) }).success).toBe(false);
	});
});

describe("toCreateTenantCommand", () => {
	it("turns the wire value into a normalized domain value", () => {
		expect(toCreateTenantCommand({ name: "  Acme " })).toEqual({ name: "Acme" });
	});

	it("raises invalid_name with its bounds", () => {
		expectDomainError(() => toCreateTenantCommand({ name: "  " }), "invalid_name", { minLength: 1, maxLength: 120 });
	});
});
