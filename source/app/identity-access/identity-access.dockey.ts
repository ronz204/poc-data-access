import type {
	IInvitationRepository,
	IMembershipRepository,
	ITenantRepository,
	ITokenVault,
	IUserRepository,
} from "@core/identity-access";
import { MembershipRepository } from "@repos/identity-access/membership/membership.repository";
import { InvitationsPageQuery } from "@repos/identity-access/invitation/invitations-page.query";
import { InvitationRepository } from "@repos/identity-access/invitation/invitation.repository";
import { AdmissionQuery } from "@repos/identity-access/membership/admission.query";
import { TenantRepository } from "@repos/identity-access/tenant/tenant.repository";
import { UserRepository } from "@repos/identity-access/user/user.repository";
import { TokenVaultAdapter } from "@infra/adapters/token-vault.adapter";
import { AcceptInviteHandler } from "@app/identity-access/accept-invite/accept-invite.handler";
import { AdmitActorHandler } from "@app/identity-access/admit-actor/admit-actor.handler";
import { ChangeRoleHandler } from "@app/identity-access/change-role/change-role.handler";
import { CreateTenantHandler } from "@app/identity-access/create-tenant/create-tenant.handler";
import { InviteMemberHandler } from "@app/identity-access/invite-member/invite-member.handler";
import { LeaveTenantHandler } from "@app/identity-access/leave-tenant/leave-tenant.handler";
import { ListInvitesHandler } from "@app/identity-access/list-invites/list-invites.handler";
import { LocateInviteHandler } from "@app/identity-access/locate-invite/locate-invite.handler";
import { RemoveMemberHandler } from "@app/identity-access/remove-member/remove-member.handler";
import { RevokeInviteHandler } from "@app/identity-access/revoke-invite/revoke-invite.handler";
import { SignUpUserHandler } from "@app/identity-access/sign-up-user/sign-up-user.handler";
import { type Container, type Module, token } from "dockdi";
import { SystemDockey } from "@keys/system.dockey";
import { DataDockey } from "@keys/data.dockey";

export class IdentityAccessDockey {
	// Persistence and adapters
	static readonly UserRepository = token<IUserRepository>("UserRepository");
	static readonly TenantRepository = token<ITenantRepository>("TenantRepository");
	static readonly MembershipRepository = token<IMembershipRepository>("MembershipRepository");
	static readonly InvitationRepository = token<IInvitationRepository>("InvitationRepository");
	static readonly AdmissionQuery = token(AdmissionQuery);
	static readonly InvitationsPageQuery = token(InvitationsPageQuery);
	static readonly TokenVault = token<ITokenVault>("TokenVault");

	// Onboarding
	static readonly SignUpUser = token(SignUpUserHandler);
	static readonly CreateTenant = token(CreateTenantHandler);
	static readonly AdmitActor = token(AdmitActorHandler);

	// Member management
	static readonly ChangeRole = token(ChangeRoleHandler);
	static readonly RemoveMember = token(RemoveMemberHandler);
	static readonly LeaveTenant = token(LeaveTenantHandler);

	// Invitations
	static readonly InviteMember = token(InviteMemberHandler);
	static readonly LocateInvite = token(LocateInviteHandler);
	static readonly AcceptInvite = token(AcceptInviteHandler);
	static readonly RevokeInvite = token(RevokeInviteHandler);
	static readonly ListInvites = token(ListInvitesHandler);

	static module(): Module {
		return (container) => {
			IdentityAccessDockey.persistence(container);
			IdentityAccessDockey.onboarding(container);
			IdentityAccessDockey.members(container);
			IdentityAccessDockey.invitations(container);
		};
	}

	private static persistence(container: Container): void {
		container.bind(IdentityAccessDockey.UserRepository).toClass(UserRepository, [DataDockey.Executor]);
		container.bind(IdentityAccessDockey.TenantRepository).toClass(TenantRepository, [DataDockey.Executor]);
		container.bind(IdentityAccessDockey.MembershipRepository).toClass(MembershipRepository, [DataDockey.Executor]);
		container.bind(IdentityAccessDockey.InvitationRepository).toClass(InvitationRepository, [DataDockey.Executor]);
		container.bind(IdentityAccessDockey.AdmissionQuery).toClass(AdmissionQuery, [DataDockey.Executor]);
		container.bind(IdentityAccessDockey.InvitationsPageQuery).toClass(InvitationsPageQuery, [DataDockey.Executor]);
		container.bind(IdentityAccessDockey.TokenVault).toClass(TokenVaultAdapter, []);
	}

	private static onboarding(container: Container): void {
		container.bind(IdentityAccessDockey.SignUpUser).toClass(SignUpUserHandler, [
			IdentityAccessDockey.UserRepository,
			SystemDockey.Clock,
			SystemDockey.NewId,
		]);
		container.bind(IdentityAccessDockey.CreateTenant).toClass(CreateTenantHandler, [
			IdentityAccessDockey.TenantRepository,
			IdentityAccessDockey.MembershipRepository,
			DataDockey.Context,
			SystemDockey.Clock,
			SystemDockey.NewId,
		]);
		container.bind(IdentityAccessDockey.AdmitActor).toClass(AdmitActorHandler, [
			IdentityAccessDockey.AdmissionQuery,
			DataDockey.Context,
		]);
	}

	private static members(container: Container): void {
		container.bind(IdentityAccessDockey.ChangeRole).toClass(ChangeRoleHandler, [
			IdentityAccessDockey.TenantRepository,
			IdentityAccessDockey.MembershipRepository,
			DataDockey.Context,
		]);
		container.bind(IdentityAccessDockey.RemoveMember).toClass(RemoveMemberHandler, [
			IdentityAccessDockey.TenantRepository,
			IdentityAccessDockey.MembershipRepository,
			DataDockey.Context,
			SystemDockey.Clock,
		]);
		container.bind(IdentityAccessDockey.LeaveTenant).toClass(LeaveTenantHandler, [
			IdentityAccessDockey.TenantRepository,
			IdentityAccessDockey.MembershipRepository,
			DataDockey.Context,
			SystemDockey.Clock,
		]);
	}

	private static invitations(container: Container): void {
		container.bind(IdentityAccessDockey.InviteMember).toClass(InviteMemberHandler, [
			IdentityAccessDockey.MembershipRepository,
			IdentityAccessDockey.InvitationRepository,
			DataDockey.Context,
			SystemDockey.Clock,
			SystemDockey.NewId,
			IdentityAccessDockey.TokenVault,
		]);
		container.bind(IdentityAccessDockey.LocateInvite).toClass(LocateInviteHandler, [
			IdentityAccessDockey.InvitationRepository,
			IdentityAccessDockey.TokenVault,
		]);
		container.bind(IdentityAccessDockey.AcceptInvite).toClass(AcceptInviteHandler, [
			IdentityAccessDockey.TenantRepository,
			IdentityAccessDockey.UserRepository,
			IdentityAccessDockey.MembershipRepository,
			IdentityAccessDockey.InvitationRepository,
			DataDockey.Context,
			SystemDockey.Clock,
			SystemDockey.NewId,
			IdentityAccessDockey.TokenVault,
		]);
		container.bind(IdentityAccessDockey.RevokeInvite).toClass(RevokeInviteHandler, [
			IdentityAccessDockey.MembershipRepository,
			IdentityAccessDockey.InvitationRepository,
			DataDockey.Context,
		]);
		container.bind(IdentityAccessDockey.ListInvites).toClass(ListInvitesHandler, [
			IdentityAccessDockey.MembershipRepository,
			IdentityAccessDockey.InvitationsPageQuery,
			DataDockey.Context,
		]);
	}
}
