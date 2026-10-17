import { InvitationPolicy, type InvitationRole } from "@core/identity-access";
import type { MembershipRole } from "@core/shared-kernel";
import { invitationFor } from "@testing/utilities/invitation.fixtures";
import { describe, expect, it } from "vitest";

const outcome = (action: () => void) => {
	try {
		action();
		return "allowed";
	} catch (error) {
		return (error as { code: string }).code;
	}
};

describe("InvitationPolicy", () => {
	it.each([
		["owner", "admin", "allowed"],
		["owner", "member", "allowed"],
		["admin", "admin", "insufficient_role"],
		["admin", "member", "allowed"],
		["member", "member", "insufficient_role"],
	] as const)("%s inviting as %s: %s", (actor: MembershipRole, role: InvitationRole, expected) => {
		expect(outcome(() => InvitationPolicy.assertCanInvite(actor, role))).toBe(expected);
	});

	it.each([
		["owner", "admin", "allowed"],
		["owner", "member", "allowed"],
		["admin", "admin", "insufficient_role"],
		["admin", "member", "allowed"],
		["member", "member", "insufficient_role"],
	] as const)("%s revoking a %s invitation: %s", (actor: MembershipRole, role: InvitationRole, expected) => {
		expect(outcome(() => InvitationPolicy.assertCanRevoke(actor, invitationFor(1, "t", { role })))).toBe(expected);
	});

	it.each([
		["owner", "allowed"],
		["admin", "allowed"],
		["member", "insufficient_role"],
	] as const)("%s listing: %s", (actor: MembershipRole, expected) => {
		expect(outcome(() => InvitationPolicy.assertCanList(actor))).toBe(expected);
	});
});
