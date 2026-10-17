import { ListInvitesHandler } from "@app/identity-access/list-invites/list-invites.handler";
import { toListInvitesCommand } from "@app/identity-access/list-invites/list-invites.schema";
import type { InvitationListView, InvitationsPageQuery } from "@repos/identity-access/invitation/invitations-page.query";
import { asActor, seedTenant, TENANT } from "@testing/utilities/membership.fixtures";
import { Cursor, type CursorKey, type MembershipRole, type Page, type TenantId } from "@core/shared-kernel";
import { InvitationId, InvitationRole, InvitationStatus } from "@core/identity-access";
import { idOf, NOW } from "@testing/utilities/invitation.fixtures";
import { describe, expect, it } from "vitest";
import { Email, UserId } from "@core/shared-kernel";
import { userOf } from "@testing/utilities/membership.fixtures";

const row: InvitationListView = {
	id: InvitationId.parse(idOf(1)),
	invitedBy: UserId.parse(userOf(1)),
	email: Email.parse("guest@example.com"),
	role: InvitationRole.parse("member"),
	status: InvitationStatus.parse("pending"),
	expiresAt: new Date(NOW.getTime() + 1000),
	createdAt: NOW,
	acceptedAt: null,
};

function setup(role: MembershipRole, page: Page<InvitationListView> = { items: [row], nextCursor: "next" }) {
	const { memberships } = seedTenant({ 1: role });
	const calls: [TenantId, CursorKey | null, number][] = [];
	const query = {
		execute: async (tenantId: TenantId, after: CursorKey | null, pageSize: number) => {
			calls.push([tenantId, after, pageSize]);
			return page;
		},
	} as InvitationsPageQuery;
	return { calls, handler: new ListInvitesHandler(memberships, query, asActor(1)) };
}

describe("ListInvitesHandler", () => {
	it.each(["owner", "admin"] as const)("lets an %s list, mapping rows to the wire shape", async (role) => {
		const { handler } = setup(role);
		expect(await handler.execute(toListInvitesCommand({}))).toEqual({
			items: [
				{
					id: row.id,
					email: "guest@example.com",
					role: "member",
					status: "pending",
					expiresAt: row.expiresAt.toISOString(),
					createdAt: NOW.toISOString(),
					acceptedAt: null,
				},
			],
			nextCursor: "next",
		});
	});

	it("rejects a member and does not read", async () => {
		const { handler, calls } = setup("member");
		await expect(handler.execute(toListInvitesCommand({}))).rejects.toMatchObject({ code: "insufficient_role" });
		expect(calls).toEqual([]);
	});

	it("asks for the run's tenant with the decoded cursor and the page size", async () => {
		const { handler, calls } = setup("owner");
		const key = { createdAt: NOW, id: idOf(1) };
		await handler.execute(toListInvitesCommand({ cursor: Cursor.encode(key), pageSize: 5 }));
		expect(calls).toEqual([[TENANT, key, 5]]);
	});

	it("passes the last page through with no next cursor", async () => {
		const { handler } = setup("owner", { items: [], nextCursor: null });
		expect(await handler.execute(toListInvitesCommand({}))).toEqual({ items: [], nextCursor: null });
	});

	it("rejects an actor that is not an active member", async () => {
		const { memberships } = seedTenant({ 2: "owner" });
		const handler = new ListInvitesHandler(memberships, {} as InvitationsPageQuery, asActor(1));
		await expect(handler.execute(toListInvitesCommand({}))).rejects.toMatchObject({ code: "not_a_member" });
	});
});
