import { LeaveTenantHandler } from "@app/identity-access/leave-tenant/leave-tenant.handler";
import { asActor, seedTenant, TENANT, userOf } from "@testing/utilities/membership.fixtures";
import { describe, expect, it } from "vitest";
import type { MembershipRole } from "@core/shared-kernel";

const NOW = new Date("2026-02-01T00:00:00.000Z");

function setup(roles: Record<number, MembershipRole>, actor = 1) {
	const { tenants, memberships } = seedTenant(roles);
	return { tenants, memberships, handler: new LeaveTenantHandler(tenants, memberships, asActor(actor), () => NOW) };
}

describe("LeaveTenantHandler", () => {
	it.each(["admin", "member"] as const)("lets a %s leave, keeping the row", async (role) => {
		const { handler, memberships } = setup({ 1: role, 2: "owner" });
		expect(await handler.execute()).toMatchObject({ userId: userOf(1), removedAt: NOW.toISOString() });
		expect(await memberships.findActive(TENANT, userOf(1))).toBeNull();
		expect(memberships.stored.size).toBe(2);
	});

	it("locks the tenant first", async () => {
		const { handler, tenants } = setup({ 1: "member", 2: "owner" });
		await handler.execute();
		expect(tenants.locked).toEqual([TENANT]);
	});

	it("lets an owner leave while another owner remains", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "owner" });
		await handler.execute();
		expect(await memberships.countActiveOwners(TENANT)).toBe(1);
	});

	it("rejects the last owner leaving", async () => {
		const { handler, memberships } = setup({ 1: "owner", 2: "member" });
		await expect(handler.execute()).rejects.toMatchObject({ code: "last_owner" });
		expect(await memberships.findActive(TENANT, userOf(1))).not.toBeNull();
	});

	it("rejects leaving twice", async () => {
		const { handler } = setup({ 1: "member", 2: "owner" });
		await handler.execute();
		await expect(handler.execute()).rejects.toMatchObject({ code: "not_a_member" });
	});
});
