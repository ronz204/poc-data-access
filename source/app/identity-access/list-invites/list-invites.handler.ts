import type { InvitationsPageQuery } from "@repos/identity-access/invitation/invitations-page.query";
import { type IMembershipRepository, InvitationPolicy } from "@core/identity-access";
import type { ListInvitesCommand, ListInvitesOutput } from "./list-invites.schema";
import { AdmissionError } from "@core/shared-kernel";
import { toInvitationView } from "../identity-access.views";
import type { RunContext } from "@dal/dal.contexter";

export class ListInvitesHandler {
	constructor(
		private readonly memberships: IMembershipRepository,
		private readonly page: InvitationsPageQuery,
		private readonly context: RunContext,
	) {}

	async execute(command: ListInvitesCommand): Promise<ListInvitesOutput> {
		const tenantId = this.context.tenant;

		const actor = await this.memberships.findActive(tenantId, this.context.actor);
		if (!actor) throw new AdmissionError("not_a_member");
		InvitationPolicy.assertCanList(actor.role);

		const { items, nextCursor } = await this.page.execute(tenantId, command.after, command.pageSize);
		return { items: items.map(toInvitationView), nextCursor };
	}
}
