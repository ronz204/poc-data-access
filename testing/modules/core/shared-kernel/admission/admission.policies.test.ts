import { AdmissionPolicy, MembershipRole, TenantId, UserId } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

const view = {
	tenantId: TenantId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abce"),
	userId: UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcf"),
	role: "admin",
} as const;

describe("AdmissionPolicy", () => {
	it("admits an actor with an active membership and returns its view", () => {
		expect(AdmissionPolicy.admit(view)).toBe(view);
	});

	it("refuses an actor without one, with the not_a_member code", () => {
		expect(() => AdmissionPolicy.admit(null)).toThrowError(expect.objectContaining({ code: "not_a_member" }));
	});
});

describe("MembershipRole", () => {
	it("accepts the three roles and nothing else", () => {
		expect(MembershipRole.values).toEqual(["owner", "admin", "member"]);
		expect(MembershipRole.is("guest")).toBe(false);
		expect(() => MembershipRole.parse("guest")).toThrow();
	});
});
