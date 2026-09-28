import { ListAuditrailToken } from "@app/auditrail/auditrail.tokens";
import { MembershipRepositoryToken } from "@app/memberships/membership.tokens";
import { CreateAvailableProjects } from "@app/projects/create-available-projects.usecase";
import { CreateProject } from "@app/projects/create-project.usecase";
import {
	CreateAvailableProjectsToken,
	CreateProjectToken,
	ListProjectsToken,
	ProjectRepositoryToken,
	RenameProjectToken,
} from "@app/projects/project.tokens";
import { RenameProject } from "@app/projects/rename-project.usecase";
import { OnboardTenant } from "@app/tenants/onboard-tenant.usecase";
import { OnboardTenantToken, TenantRepositoryToken } from "@app/tenants/tenant.tokens";
import { ChangePassword } from "@app/users/change-password.usecase";
import { ChangePasswordToken, UserRepositoryToken } from "@app/users/user.tokens";
import { Chronicler, ChroniclerToken } from "@dal/dal.chronicler";
import {
	ActorToken,
	ContextToken,
	TenantToken,
	Transactor,
	TransactorToken,
	TxToken,
} from "@dal/dal.transactor";
import { DrizzleListAuditrail } from "@infra/auditrail/queries/list-auditrail.query";
import { DrizzleMembershipRepository } from "@infra/memberships/drizzle-membership.repository";
import { DrizzleProjectRepository } from "@infra/projects/drizzle-project.repository";
import { DrizzleListProjects } from "@infra/projects/queries/list-projects.query";
import { DrizzleTenantRepository } from "@infra/tenants/drizzle-tenant.repository";
import { DrizzleUserRepository } from "@infra/users/drizzle-user.repository";
import { Container, type Module } from "dockdi";
import type postgres from "postgres";

export class Dock {
	static readonly dal: Module = (container) => {
		container.bind(ChroniclerToken).toClass(Chronicler, [TxToken, ContextToken]);
	};

	static readonly tenants: Module = (container) => {
		container.bind(TenantRepositoryToken).toClass(DrizzleTenantRepository, [TxToken]);
		container
			.bind(OnboardTenantToken)
			.toClass(OnboardTenant, [
				TenantRepositoryToken,
				UserRepositoryToken,
				MembershipRepositoryToken,
				ChroniclerToken,
				TenantToken,
				ActorToken,
			]);
	};

	static readonly users: Module = (container) => {
		container.bind(UserRepositoryToken).toClass(DrizzleUserRepository, [TxToken]);
		container
			.bind(ChangePasswordToken)
			.toClass(ChangePassword, [UserRepositoryToken, ChroniclerToken, ActorToken]);
	};

	static readonly memberships: Module = (container) => {
		container
			.bind(MembershipRepositoryToken)
			.toClass(DrizzleMembershipRepository, [TxToken, TenantToken]);
	};

	static readonly projects: Module = (container) => {
		container
			.bind(ProjectRepositoryToken)
			.toClass(DrizzleProjectRepository, [TxToken, TenantToken]);
		container.bind(ListProjectsToken).toClass(DrizzleListProjects, [TxToken]);
		container
			.bind(CreateProjectToken)
			.toClass(CreateProject, [ProjectRepositoryToken, ChroniclerToken]);
		container
			.bind(RenameProjectToken)
			.toClass(RenameProject, [ProjectRepositoryToken, ChroniclerToken]);
		container
			.bind(CreateAvailableProjectsToken)
			.toClass(CreateAvailableProjects, [TransactorToken]);
	};

	static readonly auditrail: Module = (container) => {
		container.bind(ListAuditrailToken).toClass(DrizzleListAuditrail, [TxToken]);
	};

	static create(client: postgres.Sql): Transactor {
		const container = new Container();
		const transactor = Transactor.create(container, client);

		container.bind(TransactorToken).toValue(transactor);
		container.load(
			Dock.dal,
			Dock.tenants,
			Dock.users,
			Dock.memberships,
			Dock.projects,
			Dock.auditrail,
		);

		return transactor;
	}
}
