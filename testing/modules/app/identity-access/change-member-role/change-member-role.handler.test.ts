import { ChangeMemberRoleHandler } from "@app/identity-access/change-member-role/change-member-role.handler";
import { toChangeMemberRoleCommand } from "@app/identity-access/change-member-role/change-member-role.schema";
import { asActor, seedTenant, TENANT, userOf } from "@testing/utilities/membership.fixtures";
import { describe, expect, it } from "vitest";
import type { MembershipRole } from "@core/identity-access";
import { RunContext } from "@dal/dal.contexter";

const change = (n: number, role: string) => toChangeMemberRoleCommand({ userId: userOf(n), role });

function setup(roles: Record<number, MembershipRole>, actor: number | RunContext = 1) {
	const { tenants, memberships } = seedTenant(roles);
	const context = typeof actor === "number" ? asActor(actor) : actor;
	return { tenants, memberships, handler: new ChangeMemberRoleHandler(tenants, memberships, context) };
}

describe("ChangeMemberRoleHandler", () => {
	it("lets an owner change a member's role and returns the updated membership", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "member" });
		const view = await handler.execute(change(2, "admin"));
		expect(view).toMatchObject({ userId: userOf(2), role: "admin", removedAt: null });
		expect((await memberships.findActive(TENANT, userOf(2)))?.role).toBe("admin");
	});

	it("locks the tenant before reading memberships", async () => {
		const { handler, tenants } = setup({ 1: "owner", 2: "member" });
		await handler.execute(change(2, "admin"));
		expect(tenants.locked).toEqual([TENANT]);
	});

	it("lets an owner grant owner, so several owners can coexist", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "admin" });
		await handler.execute(change(2, "owner"));
		expect(await memberships.countActiveOwners(TENANT)).toBe(2);
	});

	it("lets an owner demote another owner while one remains", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "owner" });
		await handler.execute(change(2, "member"));
		expect(await memberships.countActiveOwners(TENANT)).toBe(1);
	});

	it("rejects demoting the last owner, even self-demotion", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "member" });
		await expect(handler.execute(change(1, "admin"))).rejects.toMatchObject({ code: "last_owner" });
		expect((await memberships.findActive(TENANT, userOf(1)))?.role).toBe("owner");
	});

	it("skips the write when the role does not change, even for the last owner", async () => {
		const { handler } = setup({ 1: "owner" });
		expect(await handler.execute(change(1, "owner"))).toMatchObject({ role: "owner" });
	});

	it.each(["admin", "member"] as const)("rejects a %s changing roles", async (role) => {
		const { handler } = setup({ 1: role, 2: "member", 3: "owner" });
		await expect(handler.execute(change(2, "admin"))).rejects.toMatchObject({ code: "insufficient_role" });
	});

	it("rejects a target that is not an active member", async () => {
		const { handler } = setup({ 1: "owner" });
		await expect(handler.execute(change(9, "admin"))).rejects.toMatchObject({ code: "member_not_found" });
	});

	it("rejects an actor that is not an active member", async () => {
		const { handler } = setup({ 2: "member" }, 1);
		await expect(handler.execute(change(2, "admin"))).rejects.toMatchObject({ code: "not_a_member" });
	});

	it("rejects an unknown tenant", async () => {
		const { tenants, handler } = setup({ 1: "owner", 2: "member" });
		tenants.stored.clear();
		await expect(handler.execute(change(2, "admin"))).rejects.toMatchObject({ code: "tenant_not_found" });
	});

	it("needs a tenant in the run context", async () => {
		const { handler } = setup({ 1: "owner" }, RunContext.platform(userOf(1)));
		await expect(handler.execute(change(1, "owner"))).rejects.toThrow("needs a tenant");
	});
});
