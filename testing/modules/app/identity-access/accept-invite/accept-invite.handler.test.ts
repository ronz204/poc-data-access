import { AcceptInviteHandler } from "@app/identity-access/accept-invite/accept-invite.handler";
import { toAcceptInviteCommand } from "@app/identity-access/accept-invite/accept-invite.schema";
import { DAY, hashOf, idOf, invitationFor, NOW } from "@testing/utilities/invitation.fixtures";
import { seedTenant, TENANT, userOf } from "@testing/utilities/membership.fixtures";
import { InMemoryInvitationRepository } from "@testing/utilities/invitation.memory";
import { InMemoryUserRepository } from "@testing/utilities/user.memory";
import { type MembershipRole, TenantId } from "@core/shared-kernel";
import { User, UserName } from "@core/identity-access";
import { RunContext } from "@dal/dal.contexter";
import { describe, expect, it } from "vitest";

const TOKEN = "clear-secret-token";
const accept = (token = TOKEN, name?: string) => toAcceptInviteCommand({ token, name });

function setup(roles: Record<number, MembershipRole> = { 1: "owner" }) {
	const { tenants, memberships } = seedTenant(roles);
	const users = new InMemoryUserRepository();
	const invitations = new InMemoryInvitationRepository();
	let counter = 100;
	const handler = new AcceptInviteHandler(
		tenants,
		users,
		memberships,
		invitations,
		RunContext.system("invitation", TENANT),
		() => NOW,
		() => idOf(++counter),
		hashOf,
	);
	return { tenants, users, memberships, invitations, handler };
}

async function withInvitation(roles?: Record<number, MembershipRole>, issuedAt = NOW) {
	const world = setup(roles);
	const invitation = invitationFor(1, TOKEN, { role: "admin", issuedAt });
	await world.invitations.insert(invitation);
	return { ...world, invitation };
}

describe("AcceptInviteHandler", () => {
	it("creates the user, the membership with the invitation's role and the accepted status together", async () => {
		const { handler, users, memberships, invitations, invitation } = await withInvitation();
		const output = await handler.execute(accept(TOKEN, " Gus "));

		const user = await users.findByEmail(invitation.email);
		expect(user).toMatchObject({ name: "Gus", email: "guest@example.com" });
		expect(output).toMatchObject({ tenantId: TENANT, userId: user?.id, role: "admin" });
		expect(await memberships.findActive(TENANT, user!.id)).toMatchObject({ id: output.membershipId, role: "admin", createdAt: NOW });
		expect(invitations.stored.get(invitation.id)).toMatchObject({ status: "accepted", acceptedAt: NOW });
	});

	it("locks the tenant first", async () => {
		const { handler, tenants } = await withInvitation();
		await handler.execute(accept(TOKEN, "Gus"));
		expect(tenants.locked).toEqual([TENANT]);
	});

	it("reuses the user that already has the invitation's email and ignores the name", async () => {
		const { handler, users, invitation } = await withInvitation();
		await users.insert(User.signUp({ id: userOf(7), email: invitation.email, name: UserName.parse("Original") }, NOW));

		const output = await handler.execute(accept());

		expect(output.userId).toBe(userOf(7));
		expect(users.stored.size).toBe(1);
	});

	it("needs a name only when no user exists, and creates nothing without it", async () => {
		const { handler, users, memberships, invitations, invitation } = await withInvitation();
		await expect(handler.execute(accept())).rejects.toMatchObject({ code: "name_required" });
		expect(users.stored.size).toBe(0);
		expect(memberships.stored.size).toBe(1);
		expect(invitations.stored.get(invitation.id)?.status).toBe("pending");
	});

	it("rejects an unknown token with no side effects", async () => {
		const { handler, users, memberships } = await withInvitation();
		await expect(handler.execute(accept("other-token", "Gus"))).rejects.toMatchObject({ code: "invitation_invalid" });
		expect(users.stored.size).toBe(0);
		expect(memberships.stored.size).toBe(1);
	});

	it("rejects an expired invitation with no side effects", async () => {
		const { handler, users, memberships } = await withInvitation({ 1: "owner" }, new Date(NOW.getTime() - 7 * DAY));
		await expect(handler.execute(accept(TOKEN, "Gus"))).rejects.toMatchObject({ code: "invitation_invalid" });
		expect(users.stored.size).toBe(0);
		expect(memberships.stored.size).toBe(1);
	});

	it("rejects a revoked invitation", async () => {
		const { handler, invitations, invitation } = await withInvitation();
		await invitations.update(invitation.revoke());
		await expect(handler.execute(accept(TOKEN, "Gus"))).rejects.toMatchObject({ code: "invitation_invalid" });
	});

	it("accepts only once: the second use of the same token fails", async () => {
		const { handler, memberships } = await withInvitation();
		await handler.execute(accept(TOKEN, "Gus"));

		await expect(handler.execute(accept(TOKEN, "Gus"))).rejects.toMatchObject({ code: "invitation_invalid" });
		expect(memberships.stored.size).toBe(2);
	});

	it("fails and leaves the invitation pending when the user is already an active member", async () => {
		const { handler, users, memberships, invitations, invitation } = await withInvitation({ 1: "owner", 7: "member" });
		await users.insert(User.signUp({ id: userOf(7), email: invitation.email, name: UserName.parse("Gus") }, NOW));

		await expect(handler.execute(accept())).rejects.toMatchObject({ code: "already_member" });
		expect(memberships.stored.size).toBe(2);
		expect(invitations.stored.get(invitation.id)?.status).toBe("pending");
	});

	it("never enrolls through an invitation of another tenant", async () => {
		const { tenants, users, memberships, invitations } = await withInvitation();
		const other = TenantId.parse("0192f3a4-5b6c-7d8e-9f01-000000000002");
		tenants.stored.set(other, tenants.stored.get(TENANT)!);
		const foreign = new AcceptInviteHandler(
			tenants, users, memberships, invitations, RunContext.system("invitation", other), () => NOW, () => idOf(900), hashOf,
		);

		await expect(foreign.execute(accept(TOKEN, "Gus"))).rejects.toMatchObject({ code: "invitation_invalid" });
		expect(users.stored.size).toBe(0);
	});

	it("rejects an unknown tenant", async () => {
		const { handler, tenants } = await withInvitation();
		tenants.stored.clear();
		await expect(handler.execute(accept(TOKEN, "Gus"))).rejects.toMatchObject({ code: "tenant_not_found" });
	});

	it("needs a tenant in the run context and no actor", async () => {
		const { tenants, users, memberships, invitations } = setup();
		const platform = new AcceptInviteHandler(
			tenants, users, memberships, invitations, RunContext.platform(userOf(1)), () => NOW, () => idOf(1), hashOf,
		);
		await expect(platform.execute(accept())).rejects.toThrow("needs a tenant");
	});
});
