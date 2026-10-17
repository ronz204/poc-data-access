import type { IMembershipRepository, ITenantRepository, IUserRepository } from "@core/identity-access";
import { MembershipRepository } from "@repos/identity-access/membership/membership.repository";
import { CreateTenantHandler } from "@app/identity-access/create-tenant/create-tenant.handler";
import { SignUpUserHandler } from "@app/identity-access/sign-up-user/sign-up-user.handler";
import { TenantRepository } from "@repos/identity-access/tenant/tenant.repository";
import { UserRepository } from "@repos/identity-access/user/user.repository";
import { type Module, token } from "dockdi";
import { SystemDockey } from "@keys/system.dockey";
import { DataDockey } from "@keys/data.dockey";

export class IdentityAccessDockey {
	static readonly UserRepository = token<IUserRepository>("UserRepository");
	static readonly TenantRepository = token<ITenantRepository>("TenantRepository");
	static readonly MembershipRepository = token<IMembershipRepository>("MembershipRepository");
	static readonly SignUpUser = token(SignUpUserHandler);
	static readonly CreateTenant = token(CreateTenantHandler);

	static module(): Module {
		return (container) => {
			container.bind(IdentityAccessDockey.UserRepository).toClass(UserRepository, [DataDockey.Executor]);
			container.bind(IdentityAccessDockey.TenantRepository).toClass(TenantRepository, [DataDockey.Executor]);
			container.bind(IdentityAccessDockey.MembershipRepository).toClass(MembershipRepository, [DataDockey.Executor]);
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
		};
	}
}
