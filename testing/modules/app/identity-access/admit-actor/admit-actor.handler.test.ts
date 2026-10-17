import { AdmitActorHandler } from "@app/identity-access/admit-actor/admit-actor.handler";
import type { AdmissionQuery } from "@repos/identity-access/membership/admission.query";
import { asActor, TENANT, userOf } from "@testing/utilities/membership.fixtures";
import { type AdmissionView, type TenantId, type UserId } from "@core/shared-kernel";
import { RunContext } from "@dal/dal.contexter";
import { describe, expect, it } from "vitest";

function queryOf(view: AdmissionView | null) {
	const calls: [TenantId, UserId][] = [];
	const query = {
		execute: async (tenantId: TenantId, userId: UserId) => {
			calls.push([tenantId, userId]);
			return view;
		},
	} as AdmissionQuery;
	return { query, calls };
}

describe("AdmitActorHandler", () => {
	it("returns the view of the actor's active membership, asking with the run's tenant and actor", async () => {
		const view = { tenantId: TENANT, userId: userOf(1), role: "admin" } as const;
		const { query, calls } = queryOf(view);

		expect(await new AdmitActorHandler(query, asActor(1)).execute()).toBe(view);
		expect(calls).toEqual([[TENANT, userOf(1)]]);
	});

	it("refuses an actor with no active membership", async () => {
		const { query } = queryOf(null);
		await expect(new AdmitActorHandler(query, asActor(1)).execute()).rejects.toMatchObject({ code: "not_a_member" });
	});

	it("needs a tenant and an actor in the run context, before asking anything", async () => {
		const { query, calls } = queryOf(null);
		await expect(new AdmitActorHandler(query, RunContext.platform(userOf(1))).execute()).rejects.toThrow("needs a tenant");
		await expect(new AdmitActorHandler(query, RunContext.system("test", TENANT)).execute()).rejects.toThrow("needs an actor");
		expect(calls).toEqual([]);
	});
});
