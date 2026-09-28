import { PersistenceError } from "@dal/dal.exceptions";
import { TenantToken, Transactor, TransactorToken, TxToken } from "@dal/dal.transactor";
import { ViolationTranslator } from "@dal/dal.translator";
import { generateId } from "@db/helpers/column.helper";
import type { Executor } from "@db/helpers/executor.helper";
import { memberships } from "@db/models/memberships.model";
import { ProjectConstraints, projects } from "@db/models/projects.model";
import { TenantConstraints, tenants } from "@db/models/tenants.model";
import { UserConstraints, users } from "@db/models/users.model";
import { env } from "@env";
import { Container, MissingTokenError, token } from "dockdi";
import postgres from "postgres";

class SlugTakenError extends Error {
	constructor(readonly slug: string) {
		super(`slug "${slug}" is already taken`);
		this.name = "SlugTakenError";
	}
}

class EmailTakenError extends Error {
	constructor(readonly email: string) {
		super(`email "${email}" is already taken`);
		this.name = "EmailTakenError";
	}
}

class TenantRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async create(tenant: Omit<typeof tenants.$inferInsert, "id">): Promise<void> {
		await ViolationTranslator.translate(
			this.tx.insert(tenants).values({ ...tenant, id: this.tenantId }),
			{ [TenantConstraints.slug]: () => new SlugTakenError(tenant.slug) },
		);
	}
}

class UserRepository {
	constructor(private readonly tx: Executor) {}

	async create(user: typeof users.$inferInsert): Promise<void> {
		await ViolationTranslator.translate(this.tx.insert(users).values(user), {
			[UserConstraints.email]: () => new EmailTakenError(user.email),
		});
	}
}

class MembershipRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async create(membership: Omit<typeof memberships.$inferInsert, "tenantId">): Promise<void> {
		await this.tx.insert(memberships).values({ ...membership, tenantId: this.tenantId });
	}
}

class ProjectRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async create(project: Omit<typeof projects.$inferInsert, "tenantId">): Promise<void> {
		await ViolationTranslator.translate(
			this.tx.insert(projects).values({ ...project, tenantId: this.tenantId }),
			{ [ProjectConstraints.slug]: () => new SlugTakenError(project.slug) },
		);
	}

	list() {
		return this.tx.select({ slug: projects.slug, name: projects.name }).from(projects);
	}
}

const TenantRepositoryToken = token(TenantRepository);
const UserRepositoryToken = token(UserRepository);
const MembershipRepositoryToken = token(MembershipRepository);
const ProjectRepositoryToken = token(ProjectRepository);

class OnboardingService {
	constructor(
		private readonly tenants: TenantRepository,
		private readonly users: UserRepository,
		private readonly memberships: MembershipRepository,
	) {}

	async onboard(name: string, slug: string, ownerEmail: string): Promise<void> {
		const userId = generateId();
		await this.tenants.create({ name, slug });
		await this.users.create({ id: userId, email: ownerEmail, name, passwordHash: "sample" });
		await this.memberships.create({ userId, role: "owner" });
	}
}

class ProjectService {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly transactor: Transactor,
	) {}

	create(name: string, slug: string): Promise<void> {
		return this.projects.create({ name, slug });
	}

	async createAvailable(slugs: string[]): Promise<string[]> {
		const created: string[] = [];
		for (const slug of slugs) {
			try {
				await this.transactor.run(ProjectRepositoryToken, (projects) =>
					projects.create({ name: slug, slug }),
				);
				created.push(slug);
			} catch (error) {
				if (!(error instanceof SlugTakenError)) throw error;
			}
		}
		return created;
	}

	list() {
		return this.projects.list();
	}
}

const OnboardingServiceToken = token(OnboardingService);
const ProjectServiceToken = token(ProjectService);

const container = new Container();
const transactor = Transactor.create(container, postgres(env.POSTGRES_RUNNER_URL));

container.bind(TransactorToken).toValue(transactor);
container.bind(TenantRepositoryToken).toClass(TenantRepository, [TxToken, TenantToken]);
container.bind(UserRepositoryToken).toClass(UserRepository, [TxToken]);
container.bind(MembershipRepositoryToken).toClass(MembershipRepository, [TxToken, TenantToken]);
container.bind(ProjectRepositoryToken).toClass(ProjectRepository, [TxToken, TenantToken]);
container
	.bind(OnboardingServiceToken)
	.toClass(OnboardingService, [
		TenantRepositoryToken,
		UserRepositoryToken,
		MembershipRepositoryToken,
	]);
container
	.bind(ProjectServiceToken)
	.toClass(ProjectService, [ProjectRepositoryToken, TransactorToken]);

const suffix = generateId().slice(-6);
const acme = transactor.forTenant(generateId());
const globex = transactor.forTenant(generateId());
const otherTenantId = generateId();

try {
	await acme.run(OnboardingServiceToken, (onboarding) =>
		onboarding.onboard("Acme", `acme-${suffix}`, `owner@acme-${suffix}.dev`),
	);
	await globex.run(OnboardingServiceToken, (onboarding) =>
		onboarding.onboard("Globex", `globex-${suffix}`, `owner@globex-${suffix}.dev`),
	);

	await acme.run(ProjectServiceToken, (service) => service.create("Web", "web"));
	await globex.run(ProjectServiceToken, (service) => service.create("Web", "web"));

	await acme
		.run(ProjectServiceToken, (service) => service.create("Web again", "web"))
		.catch((error) => {
			if (!(error instanceof SlugTakenError)) throw error;
			console.log("duplicate slug     :", error.message);
		});

	const created = await acme.run(ProjectServiceToken, (service) =>
		service.createAvailable(["api", "web", "docs"]),
	);
	console.log("savepoints         :", created);

	await acme
		.run(TxToken, (tx) =>
			tx.insert(projects).values({ tenantId: otherTenantId, name: "Intruder", slug: "intruder" }),
		)
		.catch((error) => {
			if (!(error instanceof PersistenceError)) throw error;
			console.log("cross-tenant (raw) :", error.kind, error.code);
		});

	const acmeProjects = await acme.run(ProjectServiceToken, (service) => service.list());
	const globexProjects = await globex.run(ProjectServiceToken, (service) => service.list());
	const noTenantRaw = await transactor.run(TxToken, (tx) => tx.select().from(projects));

	console.log(
		"acme sees          :",
		acmeProjects.map((project) => project.slug),
	);
	console.log(
		"globex sees        :",
		globexProjects.map((project) => project.slug),
	);
	console.log(
		"no tenant (raw)    :",
		noTenantRaw.map((project) => project.slug),
	);

	await transactor
		.run(ProjectServiceToken, (service) => service.list())
		.catch((error) => {
			if (!(error instanceof MissingTokenError)) throw error;
			console.log("no tenant (service):", error.name);
		});
} finally {
	await transactor.close();
}
