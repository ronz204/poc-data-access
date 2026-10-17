import { InvitationRole, InvitationStatus, TokenHash } from "@core/identity-access";
import { DAY, hashOf, invitationFor, NOW } from "@testing/utilities/invitation.fixtures";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("Invitation", () => {
	const pending = invitationFor(1, "secret");

	it("is issued pending, expiring seven days after the time given", () => {
		expect(pending).toMatchObject({ status: "pending", createdAt: NOW, acceptedAt: null });
		expect(pending.expiresAt.getTime()).toBe(NOW.getTime() + 7 * DAY);
	});

	it("expires exactly when expiresAt is no longer in the future", () => {
		expect(pending.isExpired(new Date(pending.expiresAt.getTime() - 1))).toBe(false);
		expect(pending.isExpired(pending.expiresAt)).toBe(true);
	});

	it("accepts once, stamping acceptedAt, and never again", () => {
		const accepted = pending.accept(NOW);
		expect(accepted).toMatchObject({ status: "accepted", acceptedAt: NOW });
		expect(pending.status).toBe("pending");
		expectDomainError(() => accepted.accept(NOW), "invitation_invalid");
	});

	it("cannot be accepted when expired or revoked", () => {
		expectDomainError(() => pending.accept(pending.expiresAt), "invitation_invalid");
		expectDomainError(() => pending.revoke().accept(NOW), "invitation_invalid");
	});

	it("revokes only while pending", () => {
		expect(pending.revoke().status).toBe("revoked");
		expectDomainError(() => pending.revoke().revoke(), "not_pending");
		expectDomainError(() => pending.accept(NOW).revoke(), "not_pending");
	});

	it("can revoke a pending invitation that has already expired", () => {
		expect(pending.revoke().status).toBe("revoked");
		expect(pending.isExpired(new Date(NOW.getTime() + 8 * DAY))).toBe(true);
	});
});

describe("invitation value objects", () => {
	it("never offers owner as an invitation role", () => {
		expect(InvitationRole.values).toEqual(["admin", "member"]);
		expect(InvitationRole.is("owner")).toBe(false);
	});

	it("knows the three statuses", () => {
		expect(InvitationStatus.values).toEqual(["pending", "accepted", "revoked"]);
	});

	it("accepts a sha-256 digest and rejects anything else", () => {
		expect(TokenHash.parse(hashOf("secret"))).toBe(hashOf("secret"));
		expectDomainError(() => TokenHash.parse("secret"), "invalid_token_hash");
		expectDomainError(() => TokenHash.parse(hashOf("secret").toUpperCase()), "invalid_token_hash");
	});
});
