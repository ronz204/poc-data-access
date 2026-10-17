import {
	type IInvitationRepository,
	type IMembershipRepository,
	type ITenantRepository,
	type ITokenVault,
	type IUserRepository,
	InvitationError,
	Membership,
	MembershipId,
	User,
} from "@core/identity-access";
import type { AcceptInviteCommand, AcceptInviteOutput } from "./accept-invite.schema";
import type { Clock, NewId } from "@keys/system.dockey";
import { UserId } from "@core/shared-kernel";
import type { RunContext } from "@dal/dal.contexter";

export class AcceptInviteHandler {
	constructor(
		private readonly tenants: ITenantRepository,
		private readonly users: IUserRepository,
		private readonly memberships: IMembershipRepository,
		private readonly invitations: IInvitationRepository,
		private readonly context: RunContext,
		private readonly now: Clock,
		private readonly newId: NewId,
		private readonly tokens: ITokenVault,
	) {}

	async execute(command: AcceptInviteCommand): Promise<AcceptInviteOutput> {
		const tenantId = this.context.tenant;
		const now = this.now();

		await this.tenants.lock(tenantId);

		const invitation = await this.invitations.findByTokenHash(this.tokens.hash(command.token));
		if (!invitation || invitation.tenantId !== tenantId) throw new InvitationError("invitation_invalid");
		const accepted = invitation.accept(now);

		const existing = await this.users.findByEmail(invitation.email);
		if (existing && (await this.memberships.findActive(tenantId, existing.id))) {
			throw new InvitationError("already_member");
		}

		let userId: UserId;
		if (existing) {
			userId = existing.id;
		} else {
			if (!command.name) throw new InvitationError("name_required");
			const user = User.signUp({ id: UserId.parse(this.newId()), email: invitation.email, name: command.name }, now);
			await this.users.insert(user);
			userId = user.id;
		}

		const membership = Membership.join({ id: MembershipId.parse(this.newId()), tenantId, userId, role: invitation.role }, now);
		await this.memberships.insert(membership);
		await this.invitations.update(accepted);

		return { tenantId, userId: membership.userId, membershipId: membership.id, role: membership.role };
	}
}
