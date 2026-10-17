import { RemoveMemberHandler } from "@app/identity-access/remove-member/remove-member.handler";
import { toRemoveMemberCommand } from "@app/identity-access/remove-member/remove-member.schema";
import { asActor, SEED_TIME, seedTenant, TENANT, userOf } from "@testing/utilities/membership.fixtures";
import { describe, expect, it } from "vitest";
import type { MembershipRole } from "@core/shared-kernel";

const NOW = new Date("2026-02-01T00:00:00.000Z");
const remove = (n: number) => toRemoveMemberCommand({ userId: userOf(n) });

function setup(roles: Record<number, MembershipRole>, actor = 1) {
	const { tenants, memberships } = seedTenant(roles);
	return { tenants, memberships, handler: new RemoveMemberHandler(tenants, memberships, asActor(actor), () => NOW) };
}

describe("RemoveMemberHandler", () => {
	it("soft-deletes the membership, keeping the row", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "member" });
		const view = await handler.execute(remove(2));
		expect(view).toMatchObject({ userId: userOf(2), removedAt: NOW.toISOString() });
		expect(await memberships.findActive(TENANT, userOf(2))).toBeNull();
		expect(memberships.stored.size).toBe(2);
	});

	it("locks the tenant first", async () => {
		const { handler, tenants } = setup({ 1: "owner", 2: "member" });
		await handler.execute(remove(2));
		expect(tenants.locked).toEqual([TENANT]);
	});

	it.each(["owner", "admin", "member"] as const)("lets an owner remove a %s", async (role) => {
		const { handler, memberships } = setup({ 1: "owner", 2: role });
		await handler.execute(remove(2));
		expect(await memberships.findActive(TENANT, userOf(2))).toBeNull();
	});

	it("lets an admin remove a member only", async () => {
		const { handler, memberships } = setup({ 1: "admin", 2: "member" });
		await handler.execute(remove(2));
		expect(await memberships.findActive(TENANT, userOf(2))).toBeNull();
	});

	it.each(["owner", "admin"] as const)("rejects an admin removing an %s", async (role) => {
		const { handler, memberships } = setup({ 1: "admin", 2: role, 3: "owner" });
		await expect(handler.execute(remove(2))).rejects.toMatchObject({ code: "insufficient_role" });
		expect(await memberships.findActive(TENANT, userOf(2))).not.toBeNull();
	});

	it("rejects a member removing anyone", async () => {
		const { handler } = setup({ 1: "member", 2: "member", 3: "owner" });
		await expect(handler.execute(remove(2))).rejects.toMatchObject({ code: "insufficient_role" });
	});

	it("rejects removing the last owner, even self-removal", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "admin" });
		await expect(handler.execute(remove(1))).rejects.toMatchObject({ code: "last_owner" });
		expect(await memberships.countActiveOwners(TENANT)).toBe(1);
	});

	it("allows removing an owner while another remains", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "owner" });
		await handler.execute(remove(2));
		expect(await memberships.countActiveOwners(TENANT)).toBe(1);
	});

	it("rejects a target that is not an active member, including an already removed one", async () => {
		const { handler } = setup({ 1: "owner", 2: "member" });
		await handler.execute(remove(2));
		await expect(handler.execute(remove(2))).rejects.toMatchObject({ code: "member_not_found" });
	});

	it("rejects an actor that is not an active member", async () => {
		const { handler } = setup({ 2: "member" });
		await expect(handler.execute(remove(2))).rejects.toMatchObject({ code: "not_a_member" });
	});

	it("keeps the creation time of the removed membership", async () => {
		const { handler } = setup({ 1: "owner", 2: "member" });
		expect((await handler.execute(remove(2))).createdAt).toBe(SEED_TIME.toISOString());
	});
});
