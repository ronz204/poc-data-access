import { RevokeInviteHandler } from "@app/identity-access/revoke-invite/revoke-invite.handler";
import { toRevokeInviteCommand } from "@app/identity-access/revoke-invite/revoke-invite.schema";
import { idOf, invitationFor } from "@testing/utilities/invitation.fixtures";
import { asActor, seedTenant } from "@testing/utilities/membership.fixtures";
import { InMemoryInvitationRepository } from "@testing/utilities/invitation.memory";
import type { InvitationRole } from "@core/identity-access";
import type { MembershipRole } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

const revoke = (n: number) => toRevokeInviteCommand({ id: idOf(n) });

async function setup(actorRole: MembershipRole, invitationRole: InvitationRole = "member") {
	const { memberships } = seedTenant({ 1: actorRole });
	const invitations = new InMemoryInvitationRepository();
	await invitations.insert(invitationFor(1, "token", { role: invitationRole }));
	return { invitations, handler: new RevokeInviteHandler(memberships, invitations, asActor(1)) };
}

describe("RevokeInviteHandler", () => {
	it("revokes a pending invitation and returns it", async () => {
		const { handler, invitations } = await setup("owner");
		expect(await handler.execute(revoke(1))).toMatchObject({ id: idOf(1), status: "revoked" });
		expect([...invitations.stored.values()][0]?.status).toBe("revoked");
	});

	it.each([
		["owner", "admin", true],
		["owner", "member", true],
		["admin", "admin", false],
		["admin", "member", true],
		["member", "member", false],
	] as const)("%s revoking a %s invitation: allowed %s", async (actorRole, role, allowed) => {
		const { handler, invitations } = await setup(actorRole, role);
		const result = handler.execute(revoke(1));
		if (allowed) await result;
		else await expect(result).rejects.toMatchObject({ code: "insufficient_role" });
		expect([...invitations.stored.values()][0]?.status).toBe(allowed ? "revoked" : "pending");
	});

	it("rejects an invitation that is not in the tenant", async () => {
		const { handler } = await setup("owner");
		await expect(handler.execute(revoke(2))).rejects.toMatchObject({ code: "invitation_not_found" });
	});

	it("keeps an accepted invitation accepted", async () => {
		const { handler, invitations } = await setup("owner");
		const [pending] = [...invitations.stored.values()];
		await invitations.update(pending!.accept(pending!.createdAt));

		await expect(handler.execute(revoke(1))).rejects.toMatchObject({ code: "not_pending" });
		expect([...invitations.stored.values()][0]?.status).toBe("accepted");
	});

	it("rejects an actor that is not an active member", async () => {
		const { invitations } = await setup("owner");
		const stranger = new RevokeInviteHandler(seedTenant({ 2: "owner" }).memberships, invitations, asActor(1));
		await expect(stranger.execute(revoke(1))).rejects.toMatchObject({ code: "not_a_member" });
	});
});
