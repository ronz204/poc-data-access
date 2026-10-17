import { InviteMemberHandler } from "@app/identity-access/invite-member/invite-member.handler";
import { toInviteMemberCommand } from "@app/identity-access/invite-member/invite-member.schema";
import { DAY, hashOf, idOf, invitationFor, NOW } from "@testing/utilities/invitation.fixtures";
import { asActor, seedTenant, TENANT, userOf } from "@testing/utilities/membership.fixtures";
import { InMemoryInvitationRepository } from "@testing/utilities/invitation.memory";
import { InMemoryUserRepository } from "@testing/utilities/user.memory";
import { Email, type MembershipRole } from "@core/shared-kernel";
import { User, UserName } from "@core/identity-access";
import { describe, expect, it } from "vitest";

const TOKEN = "clear-secret-token";
const invite = (email: string, role: string) => toInviteMemberCommand({ email, role });

function setup(roles: Record<number, MembershipRole>, actor = 1) {
	const { memberships } = seedTenant(roles);
	const users = new InMemoryUserRepository();
	const invitations = new InMemoryInvitationRepository();
	let counter = 0;
	const handler = new InviteMemberHandler(
		users,
		memberships,
		invitations,
		asActor(actor),
		() => NOW,
		() => idOf(++counter),
		() => TOKEN,
		hashOf,
	);
	return { users, memberships, invitations, handler };
}

describe("InviteMemberHandler", () => {
	it("returns the token once and stores only its hash", async () => {
		const { handler, invitations } = setup({ 1: "owner" });
		const output = await handler.execute(invite(" Guest@Example.COM ", "admin"));

		expect(output).toMatchObject({
			email: "guest@example.com",
			role: "admin",
			status: "pending",
			token: TOKEN,
			createdAt: NOW.toISOString(),
			expiresAt: new Date(NOW.getTime() + 7 * DAY).toISOString(),
			acceptedAt: null,
		});
		const [stored] = [...invitations.stored.values()];
		expect(stored).toMatchObject({ tenantId: TENANT, invitedBy: userOf(1), tokenHash: hashOf(TOKEN) });
		expect(JSON.stringify(stored)).not.toContain(TOKEN);
	});

	it.each([
		["owner", "admin", true],
		["owner", "member", true],
		["admin", "admin", false],
		["admin", "member", true],
		["member", "member", false],
	] as const)("%s inviting as %s: allowed %s", async (actorRole, role, allowed) => {
		const { handler, invitations } = setup({ 1: actorRole });
		const result = handler.execute(invite("guest@example.com", role));
		if (allowed) await result;
		else await expect(result).rejects.toMatchObject({ code: "insufficient_role" });
		expect(invitations.stored.size).toBe(allowed ? 1 : 0);
	});

	it("rejects an actor that is not an active member", async () => {
		const { handler } = setup({ 2: "owner" }, 1);
		await expect(handler.execute(invite("guest@example.com", "member"))).rejects.toMatchObject({ code: "not_a_member" });
	});

	it("rejects an email that already has an active membership in the tenant", async () => {
		const { handler, users, invitations } = setup({ 1: "owner", 2: "member" });
		await users.insert(User.signUp({ id: userOf(2), email: Email.parse("bob@example.com"), name: UserName.parse("Bob") }, NOW));

		await expect(handler.execute(invite("BOB@example.com", "member"))).rejects.toMatchObject({ code: "already_member" });
		expect(invitations.stored.size).toBe(0);
	});

	it("allows inviting a user who has no active membership, such as a removed member", async () => {
		const { handler, users } = setup({ 1: "owner" });
		await users.insert(User.signUp({ id: userOf(9), email: Email.parse("gone@example.com"), name: UserName.parse("Gone") }, NOW));

		await expect(handler.execute(invite("gone@example.com", "member"))).resolves.toMatchObject({ email: "gone@example.com" });
	});

	it("rejects a second invitation while the first is pending and valid", async () => {
		const { handler, invitations } = setup({ 1: "owner" });
		await handler.execute(invite("guest@example.com", "member"));

		await expect(handler.execute(invite("guest@example.com", "admin"))).rejects.toMatchObject({ code: "invitation_pending" });
		expect(invitations.stored.size).toBe(1);
	});

	it("revokes an expired pending invitation and issues a new one", async () => {
		const { handler, invitations } = setup({ 1: "owner" });
		const old = invitationFor(500, "old-token", { issuedAt: new Date(NOW.getTime() - 8 * DAY) });
		await invitations.insert(old);

		const output = await handler.execute(invite("guest@example.com", "member"));

		expect(invitations.stored.get(old.id)?.status).toBe("revoked");
		expect(output).toMatchObject({ status: "pending", token: TOKEN });
		expect(invitations.stored.size).toBe(2);
	});

	it("takes the actor from the run context", async () => {
		const { handler, invitations } = setup({ 1: "owner", 2: "admin" }, 2);
		await handler.execute(invite("guest@example.com", "member"));
		expect([...invitations.stored.values()][0]?.invitedBy).toBe(userOf(2));
	});
});
