import { CreateTenantHandler } from "@app/identity-access/create-tenant/create-tenant.handler";
import { toCreateTenantCommand } from "@app/identity-access/create-tenant/create-tenant.schema";
import { InMemoryMembershipRepository, InMemoryTenantRepository } from "@testing/utilities/tenant.memory";
import { type IMembershipRepository, MembershipError } from "@core/identity-access";
import { UserId } from "@core/shared-kernel";
import { RunContext } from "@dal/dal.contexter";
import { beforeEach, describe, expect, it } from "vitest";

const ACTOR = UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abc0");
const FIXED_TIME = new Date("2026-01-01T00:00:00.000Z");
const IDS = ["0192f3a4-5b6c-7d8e-9f01-23456789abc1", "0192f3a4-5b6c-7d8e-9f01-23456789abc2"] as const;

describe("CreateTenantHandler", () => {
	let tenants: InMemoryTenantRepository;
	let memberships: InMemoryMembershipRepository;

	const command = toCreateTenantCommand({ name: " Acme " });

	function build(overrides: { memberships?: IMembershipRepository; context?: RunContext } = {}) {
		const ids = [...IDS];
		return new CreateTenantHandler(
			tenants,
			overrides.memberships ?? memberships,
			overrides.context ?? RunContext.platform(ACTOR),
			() => FIXED_TIME,
			() => ids.shift() ?? "exhausted",
		);
	}

	beforeEach(() => {
		tenants = new InMemoryTenantRepository();
		memberships = new InMemoryMembershipRepository();
	});

	it("returns the tenant and its owner membership in the wire shape", async () => {
		expect(await build().execute(command)).toEqual({
			id: IDS[0],
			name: "Acme",
			createdAt: "2026-01-01T00:00:00.000Z",
			ownerMembership: {
				id: IDS[1],
				tenantId: IDS[0],
				userId: ACTOR,
				role: "owner",
				createdAt: "2026-01-01T00:00:00.000Z",
				removedAt: null,
			},
		});
	});

	it("stores the tenant and exactly one active owner membership for the actor", async () => {
		await build().execute(command);
		expect(tenants.stored.size).toBe(1);
		expect([...memberships.stored.values()]).toMatchObject([
			{ tenantId: IDS[0], userId: ACTOR, role: "owner", removedAt: null },
		]);
	});

	it("takes the owner from the run context, never from the input", async () => {
		const other = UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abc9");
		await build({ context: RunContext.platform(other) }).execute(command);
		expect([...memberships.stored.values()][0]?.userId).toBe(other);
	});

	it("refuses to run without an actor, before writing anything", async () => {
		await expect(build({ context: RunContext.system("test") }).execute(command)).rejects.toThrow("needs an actor");
		expect(tenants.stored.size).toBe(0);
	});

	it("lets the membership failure through, so the run can roll the tenant back", async () => {
		const failing: IMembershipRepository = Object.assign(Object.create(memberships), {
			insert: async () => {
				throw new MembershipError("user_not_found");
			},
		});
		await expect(build({ memberships: failing }).execute(command)).rejects.toMatchObject({ code: "user_not_found" });
	});
});
