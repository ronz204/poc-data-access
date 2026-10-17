import { ChangeMemberRoleHandler } from "@app/identity-access/change-member-role/change-member-role.handler";
import { IdentityAccessDockey } from "@app/identity-access/identity-access.dockey";
import { type IMembershipRepository, MembershipError } from "@core/identity-access";
import { type DatabaseHarness, openDatabase } from "@testing/utilities/database.harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TenantId, UserId } from "@core/shared-kernel";
import { RunContext } from "@dal/dal.contexter";
import { DataDockey } from "@keys/data.dockey";
import { token } from "dockdi";

let db: DatabaseHarness;

beforeAll(() => {
	db = openDatabase();
});

afterAll(() => db.close());

const asActor = (tenantId: TenantId, actor: UserId) => RunContext.tenant(tenantId, actor);

const demote = (tenantId: TenantId, actor: UserId, target: UserId) =>
	db.transactor.run(asActor(tenantId, actor), IdentityAccessDockey.ChangeMemberRole, (handler) =>
		handler.execute({ userId: target, role: "member" }),
	);

const remove = (tenantId: TenantId, actor: UserId, target: UserId) =>
	db.transactor.run(asActor(tenantId, actor), IdentityAccessDockey.RemoveMember, (handler) =>
		handler.execute({ userId: target }),
	);

const leave = (tenantId: TenantId, actor: UserId) =>
	db.transactor.run(asActor(tenantId, actor), IdentityAccessDockey.LeaveTenant, (handler) => handler.execute());

function codesOf(results: readonly PromiseSettledResult<unknown>[]): string[] {
	return results
		.filter((result): result is PromiseRejectedResult => result.status === "rejected")
		.map((result) => (result.reason instanceof MembershipError ? result.reason.code : String(result.reason)));
}

const fulfilled = (results: readonly PromiseSettledResult<unknown>[]) =>
	results.filter((result) => result.status === "fulfilled").length;

// Every scenario races several runs on a tenant of its own, so repeating it in parallel also races the lock itself.
const REPEATS = 8;

describe("last-owner protection under concurrent changes", () => {
	it("lets exactly one of two owners demoting each other succeed", async () => {
		await Promise.all(
			Array.from({ length: REPEATS }, async () => {
				const { tenantId, founder, others } = await db.seedTenant(["owner"]);
				const [second] = others as [UserId];

				const results = await Promise.allSettled([demote(tenantId, founder, second), demote(tenantId, second, founder)]);

				expect(fulfilled(results)).toBe(1);
				expect(codesOf(results)).toEqual(["insufficient_role"]);
				expect(await db.activeOwners(tenantId)).toBe(1);
			}),
		);
	});

	it("lets exactly one of two owners leaving at the same time succeed", async () => {
		await Promise.all(
			Array.from({ length: REPEATS }, async () => {
				const { tenantId, founder, others } = await db.seedTenant(["owner"]);
				const [second] = others as [UserId];

				const results = await Promise.allSettled([leave(tenantId, founder), leave(tenantId, second)]);

				expect(fulfilled(results)).toBe(1);
				expect(codesOf(results)).toEqual(["last_owner"]);
				expect(await db.activeOwners(tenantId)).toBe(1);
			}),
		);
	});

	it("keeps one owner when each of two owners removes the other", async () => {
		await Promise.all(
			Array.from({ length: REPEATS }, async () => {
				const { tenantId, founder, others } = await db.seedTenant(["owner"]);
				const [second] = others as [UserId];

				const results = await Promise.allSettled([remove(tenantId, founder, second), remove(tenantId, second, founder)]);

				expect(fulfilled(results)).toBe(1);
				expect(codesOf(results)).toEqual(["not_a_member"]);
				expect(await db.activeOwners(tenantId)).toBe(1);
			}),
		);
	});

	it("keeps one owner when one owner removes the other while the other demotes them", async () => {
		await Promise.all(
			Array.from({ length: REPEATS }, async () => {
				const { tenantId, founder, others } = await db.seedTenant(["owner"]);
				const [second] = others as [UserId];

				const results = await Promise.allSettled([remove(tenantId, founder, second), demote(tenantId, second, founder)]);

				expect(fulfilled(results)).toBe(1);
				expect(await db.activeOwners(tenantId)).toBe(1);
			}),
		);
	});

	it("leaves one owner when five owners all leave at once", async () => {
		const { tenantId, founder, others } = await db.seedTenant(["owner", "owner", "owner", "owner"]);

		const results = await Promise.allSettled([founder, ...others].map((owner) => leave(tenantId, owner)));

		expect(fulfilled(results)).toBe(4);
		expect(codesOf(results)).toEqual(["last_owner"]);
		expect(await db.activeOwners(tenantId)).toBe(1);
	});

	it("does not serialize runs on different tenants", async () => {
		const first = await db.seedTenant(["owner"]);
		const second = await db.seedTenant(["owner"]);

		const results = await Promise.allSettled([
			leave(first.tenantId, first.founder),
			leave(second.tenantId, second.founder),
		]);

		expect(fulfilled(results)).toBe(2);
	});
});

describe("the tenant lock is what protects the last owner", () => {
	const Unlocked = token<ChangeMemberRoleHandler>("UnlockedChangeMemberRole");

	it("loses every owner when both demotions read the owner count before either writes", async () => {
		let arrived = 0;
		let release!: () => void;
		const bothCounted = new Promise<void>((resolve) => {
			release = resolve;
		});

		db.container
			.bind(Unlocked)
			.toFactory(
				(tenants, memberships, context) => {
					const unlocked = Object.assign(Object.create(tenants), { lock: async () => ({}) });
					const synchronized: IMembershipRepository = Object.assign(Object.create(memberships), {
						countActiveOwners: async (tenantId: TenantId) => {
							const owners = await memberships.countActiveOwners(tenantId);
							if (++arrived === 2) release();
							await bothCounted;
							return owners;
						},
					});
					return new ChangeMemberRoleHandler(unlocked, synchronized, context);
				},
				[IdentityAccessDockey.TenantRepository, IdentityAccessDockey.MembershipRepository, DataDockey.Context],
			);

		const { tenantId, founder, others } = await db.seedTenant(["owner"]);
		const [second] = others as [UserId];
		const demoteWithoutLock = (actor: UserId, target: UserId) =>
			db.transactor.run(asActor(tenantId, actor), Unlocked, (handler) => handler.execute({ userId: target, role: "member" }));

		const results = await Promise.allSettled([demoteWithoutLock(founder, second), demoteWithoutLock(second, founder)]);

		expect(fulfilled(results)).toBe(2);
		expect(await db.activeOwners(tenantId)).toBe(0);
	});
});
