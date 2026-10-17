import { AcceptInviteInput, toAcceptInviteCommand } from "@app/identity-access/accept-invite/accept-invite.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("AcceptInviteInput", () => {
	it("accepts a token with or without a name", () => {
		expect(AcceptInviteInput.safeParse({ token: "t" }).success).toBe(true);
		expect(AcceptInviteInput.safeParse({ token: "t", name: "Ana" }).success).toBe(true);
	});

	it.each([{}, { token: "" }, { token: 1 }, { token: "t".repeat(201) }])("rejects the shape %j", (body) => {
		expect(AcceptInviteInput.safeParse(body).success).toBe(false);
	});
});

describe("toAcceptInviteCommand", () => {
	it("keeps the token as is and trims the name", () => {
		expect(toAcceptInviteCommand({ token: " t ", name: " Ana " })).toEqual({ token: " t ", name: "Ana" });
	});

	it("has no name when none is given", () => {
		expect(toAcceptInviteCommand({ token: "t" }).name).toBeNull();
	});

	it("rejects a blank name when one is given", () => {
		expectDomainError(() => toAcceptInviteCommand({ token: "t", name: "  " }), "invalid_name");
	});
});
