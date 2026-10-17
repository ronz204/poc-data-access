import { Tenant, TenantName } from "@core/identity-access";
import { TenantId } from "@core/shared-kernel";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("Tenant", () => {
	it("creates a frozen tenant stamped with the given time", () => {
		const id = TenantId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcd");
		const tenant = Tenant.create({ id, name: TenantName.parse("Acme") }, NOW);
		expect(tenant).toMatchObject({ id, name: "Acme", createdAt: NOW });
		expect(Object.isFrozen(tenant)).toBe(true);
	});
});

describe("TenantName", () => {
	it("trims the name", () => {
		expect(TenantName.parse("  Acme  ")).toBe("Acme");
	});

	it("rejects an empty name with its bounds", () => {
		expectDomainError(() => TenantName.parse("   "), "invalid_name", { minLength: 1, maxLength: 120 });
	});

	it("rejects a name over the maximum", () => {
		expectDomainError(() => TenantName.parse("n".repeat(121)), "invalid_name");
		expect(TenantName.parse("n".repeat(120))).toHaveLength(120);
	});
});
