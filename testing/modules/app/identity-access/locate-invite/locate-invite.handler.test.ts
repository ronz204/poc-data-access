import { LocateInviteHandler } from "@app/identity-access/locate-invite/locate-invite.handler";
import { toLocateInviteCommand } from "@app/identity-access/locate-invite/locate-invite.schema";
import { hashOf, invitationFor } from "@testing/utilities/invitation.fixtures";
import { InMemoryInvitationRepository } from "@testing/utilities/invitation.memory";
import { TENANT } from "@testing/utilities/membership.fixtures";
import { describe, expect, it } from "vitest";

describe("LocateInviteHandler", () => {
	it("finds the tenant of the invitation behind the token, whatever its status", async () => {
		const invitations = new InMemoryInvitationRepository();
		const invitation = invitationFor(1, "token");
		await invitations.insert(invitation.revoke());

		const handler = new LocateInviteHandler(invitations, hashOf);
		expect(await handler.execute(toLocateInviteCommand({ token: "token" }))).toEqual({ tenantId: TENANT });
	});

	it("answers an unknown token as an invalid invitation", async () => {
		const handler = new LocateInviteHandler(new InMemoryInvitationRepository(), hashOf);
		await expect(handler.execute(toLocateInviteCommand({ token: "nope" }))).rejects.toMatchObject({ code: "invitation_invalid" });
	});
});
