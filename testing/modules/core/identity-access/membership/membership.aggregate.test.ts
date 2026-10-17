import { Membership, MembershipId, MembershipRole } from "@core/identity-access";
import { TenantId, UserId } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const input = {
	id: MembershipId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcd"),
	tenantId: TenantId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abce"),
	userId: UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcf"),
};

describe("Membership", () => {
	it("enrolls an active owner stamped with the given time", () => {
		const membership = Membership.enrollOwner(input, NOW);
		expect(membership).toMatchObject({ ...input, role: "owner", createdAt: NOW, removedAt: null });
		expect(Object.isFrozen(membership)).toBe(true);
	});
});

describe("MembershipRole", () => {
	it("accepts the three roles and nothing else", () => {
		expect(MembershipRole.values).toEqual(["owner", "admin", "member"]);
		expect(MembershipRole.is("guest")).toBe(false);
		expect(() => MembershipRole.parse("guest")).toThrow();
	});
});
