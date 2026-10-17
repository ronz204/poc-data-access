import { InviteMemberInput, toInviteMemberCommand } from "@app/identity-access/invite-member/invite-member.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("InviteMemberInput", () => {
	it("accepts a well formed body and bounds the wire lengths", () => {
		expect(InviteMemberInput.safeParse({ email: "a@b.co", role: "member" }).success).toBe(true);
		expect(InviteMemberInput.safeParse({ email: "x".repeat(321), role: "member" }).success).toBe(false);
		expect(InviteMemberInput.safeParse({ email: "a@b.co" }).success).toBe(false);
	});
});

describe("toInviteMemberCommand", () => {
	it("normalizes the email and parses the role", () => {
		expect(toInviteMemberCommand({ email: "  Ana@Example.COM ", role: "admin" })).toEqual({
			email: "ana@example.com",
			role: "admin",
		});
	});

	it("never accepts owner as an invitation role", () => {
		expectDomainError(() => toInviteMemberCommand({ email: "a@b.co", role: "owner" }), "invalid_literal");
	});

	it("raises the email failure first", () => {
		expectDomainError(() => toInviteMemberCommand({ email: "nope", role: "owner" }), "invalid_email");
	});
});
