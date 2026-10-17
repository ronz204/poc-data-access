import { Membership, MembershipId, MembershipPolicy, type MembershipRole } from "@core/identity-access";
import { TenantId, UserId } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const base = {
	id: MembershipId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcd"),
	tenantId: TenantId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abce"),
	userId: UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcf"),
};
const as = (role: MembershipRole) => Membership.enrollOwner(base, NOW).changeRole(role);
const code = (action: () => void) => {
	try {
		action();
		return "allowed";
	} catch (error) {
		return (error as { code: string }).code;
	}
};

describe("MembershipPolicy", () => {
	it.each([
		["owner", "allowed"],
		["admin", "insufficient_role"],
		["member", "insufficient_role"],
	] as const)("%s changing a role: %s", (role, expected) => {
		expect(code(() => MembershipPolicy.assertCanChangeRole(as(role)))).toBe(expected);
	});

	it.each([
		["owner", "owner", "allowed"],
		["owner", "admin", "allowed"],
		["owner", "member", "allowed"],
		["admin", "owner", "insufficient_role"],
		["admin", "admin", "insufficient_role"],
		["admin", "member", "allowed"],
		["member", "member", "insufficient_role"],
	] as const)("%s removing a %s: %s", (actor, target, expected) => {
		expect(code(() => MembershipPolicy.assertCanRemove(as(actor), as(target)))).toBe(expected);
	});

	it("protects the last active owner only", () => {
		expect(code(() => MembershipPolicy.assertKeepsOwner(as("owner"), 1))).toBe("last_owner");
		expect(code(() => MembershipPolicy.assertKeepsOwner(as("owner"), 2))).toBe("allowed");
		expect(code(() => MembershipPolicy.assertKeepsOwner(as("admin"), 1))).toBe("allowed");
	});
});
