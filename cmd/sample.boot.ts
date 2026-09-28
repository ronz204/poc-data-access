import { Chronicler, ChroniclerToken } from "@dal/dal.chronicler";
import { PersistenceError } from "@dal/dal.exceptions";
import {
	ActorToken,
	ContextToken,
	TenantToken,
	Transactor,
	TransactorToken,
	TxToken,
} from "@dal/dal.transactor";
import { ViolationTranslator } from "@dal/dal.translator";
import { generateId } from "@db/helpers/column.helper";
import type { Executor } from "@db/helpers/executor.helper";
import { auditrail } from "@db/models/auditrail.model";
import { memberships } from "@db/models/memberships.model";
import { ProjectConstraints, projects } from "@db/models/projects.model";
import { TenantConstraints, tenants } from "@db/models/tenants.model";
import { UserConstraints, users } from "@db/models/users.model";
import { env } from "@env";
import { Container, MissingTokenError, token } from "dockdi";
import { asc, eq } from "drizzle-orm";
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

class ProjectNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`project "${id}" was not found`);
		this.name = "ProjectNotFoundError";
	}
}

class TenantRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async create(tenant: Omit<typeof tenants.$inferInsert, "id">): Promise<string> {
		await ViolationTranslator.translate(
			this.tx.insert(tenants).values({ ...tenant, id: this.tenantId }),
			{ [TenantConstraints.slug]: () => new SlugTakenError(tenant.slug) },
		);
		return this.tenantId;
	}
}

class UserRepository {
	constructor(private readonly tx: Executor) {}

	async create(user: typeof users.$inferInsert): Promise<void> {
		await ViolationTranslator.translate(this.tx.insert(users).values(user), {
			[UserConstraints.email]: () => new EmailTakenError(user.email),
		});
	}

	async updatePassword(id: string, passwordHash: string): Promise<void> {
		await this.tx.update(users).set({ passwordHash }).where(eq(users.id, id));
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

	async create(project: Omit<typeof projects.$inferInsert, "tenantId" | "id">): Promise<string> {
		const id = generateId();
		await ViolationTranslator.translate(
			this.tx.insert(projects).values({ ...project, id, tenantId: this.tenantId }),
			{ [ProjectConstraints.slug]: () => new SlugTakenError(project.slug) },
		);
		return id;
	}

	async find(id: string) {
		const [row] = await this.tx.select().from(projects).where(eq(projects.id, id));
		if (!row) throw new ProjectNotFoundError(id);
		return row;
	}

	async rename(id: string, name: string): Promise<void> {
		await this.tx.update(projects).set({ name }).where(eq(projects.id, id));
	}

	list() {
		return this.tx.select({ slug: projects.slug, name: projects.name }).from(projects);
	}
}

class AuditrailRepository {
	constructor(private readonly tx: Executor) {}

	list() {
		return this.tx.select().from(auditrail).orderBy(asc(auditrail.id));
	}
}

const TenantRepositoryToken = token(TenantRepository);
const UserRepositoryToken = token(UserRepository);
const MembershipRepositoryToken = token(MembershipRepository);
const ProjectRepositoryToken = token(ProjectRepository);
const AuditrailRepositoryToken = token(AuditrailRepository);

class OnboardingService {
	constructor(
		private readonly tenants: TenantRepository,
		private readonly users: UserRepository,
		private readonly memberships: MembershipRepository,
		private readonly chronicler: Chronicler,
	) {}

	async onboard(userId: string, name: string, slug: string, ownerEmail: string): Promise<void> {
		const tenantId = await this.tenants.create({ name, slug });
		await this.chronicler.record({
			action: "tenant.created",
			entity: "tenants",
			entityId: tenantId,
			changes: Chronicler.created({ name, slug }),
		});

		await this.users.create({ id: userId, email: ownerEmail, name, passwordHash: "sample" });
		await this.chronicler.record({
			action: "user.created",
			entity: "users",
			entityId: userId,
			changes: Chronicler.created({ email: ownerEmail, name }),
		});

		await this.memberships.create({ userId, role: "owner" });
		await this.chronicler.record({
			action: "membership.created",
			entity: "memberships",
			changes: Chronicler.created({ userId, role: "owner" }),
		});
	}
}

class ProjectService {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
		private readonly transactor: Transactor,
	) {}

	async create(name: string, slug: string): Promise<string> {
		const id = await this.projects.create({ name, slug });
		await this.chronicler.record({
			action: "project.created",
			entity: "projects",
			entityId: id,
			changes: Chronicler.created({ name, slug }),
		});
		return id;
	}

	async rename(id: string, name: string): Promise<void> {
		const before = await this.projects.find(id);
		await this.projects.rename(id, name);
		await this.chronicler.record({
			action: "project.renamed",
			entity: "projects",
			entityId: id,
			changes: Chronicler.diff(before, { name }),
		});
	}

	async createAvailable(slugs: string[]): Promise<string[]> {
		const created: string[] = [];
		for (const slug of slugs) {
			try {
				await this.transactor.run(ProjectServiceToken, (service) => service.create(slug, slug));
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

class ProfileService {
	constructor(
		private readonly users: UserRepository,
		private readonly chronicler: Chronicler,
		private readonly actorId: string,
	) {}

	async changePassword(passwordHash: string): Promise<void> {
		await this.users.updatePassword(this.actorId, passwordHash);
		await this.chronicler.record({
			action: "user.password_changed",
			entity: "users",
			entityId: this.actorId,
		});
	}
}

const OnboardingServiceToken = token(OnboardingService);
const ProjectServiceToken = token(ProjectService);
const ProfileServiceToken = token(ProfileService);

const container = new Container();
const transactor = Transactor.create(container, postgres(env.POSTGRES_RUNNER_URL));

container.bind(TransactorToken).toValue(transactor);
container.bind(ChroniclerToken).toClass(Chronicler, [TxToken, ContextToken]);
container.bind(TenantRepositoryToken).toClass(TenantRepository, [TxToken, TenantToken]);
container.bind(UserRepositoryToken).toClass(UserRepository, [TxToken]);
container.bind(MembershipRepositoryToken).toClass(MembershipRepository, [TxToken, TenantToken]);
container.bind(ProjectRepositoryToken).toClass(ProjectRepository, [TxToken, TenantToken]);
container.bind(AuditrailRepositoryToken).toClass(AuditrailRepository, [TxToken]);
container
	.bind(OnboardingServiceToken)
	.toClass(OnboardingService, [
		TenantRepositoryToken,
		UserRepositoryToken,
		MembershipRepositoryToken,
		ChroniclerToken,
	]);
container
	.bind(ProjectServiceToken)
	.toClass(ProjectService, [ProjectRepositoryToken, ChroniclerToken, TransactorToken]);
container
	.bind(ProfileServiceToken)
	.toClass(ProfileService, [UserRepositoryToken, ChroniclerToken, ActorToken]);

const suffix = generateId().slice(-6);
const acmeOwner = generateId();
const globexOwner = generateId();
const acmeId = generateId();
const acme = transactor.forTenant(acmeId).forActor(acmeOwner);
const acmeJob = transactor.forTenant(acmeId);
const globex = transactor.forTenant(generateId()).forActor(globexOwner);
const otherTenantId = generateId();

try {
	await acme.run(OnboardingServiceToken, (onboarding) =>
		onboarding.onboard(acmeOwner, "Acme", `acme-${suffix}`, `owner@acme-${suffix}.dev`),
	);
	await globex.run(OnboardingServiceToken, (onboarding) =>
		onboarding.onboard(globexOwner, "Globex", `globex-${suffix}`, `owner@globex-${suffix}.dev`),
	);

	const webId = await acme.run(ProjectServiceToken, (service) => service.create("Web", "web"));
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

	await acme.run(ProjectServiceToken, (service) => service.rename(webId, "Website"));

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

	await transactor
		.forActor(acmeOwner)
		.run(ProfileServiceToken, (profile) => profile.changePassword("rotated"));

	await transactor
		.run(ProfileServiceToken, (profile) => profile.changePassword("nobody"))
		.catch((error) => {
			if (!(error instanceof MissingTokenError)) throw error;
			console.log("no actor (profile) :", error.name);
		});

	await acmeJob.run(ProjectServiceToken, (service) => service.create("Nightly", "nightly"));

	const trail = await acme.run(AuditrailRepositoryToken, (repository) => repository.list());
	const identityTrail = await transactor
		.forActor(acmeOwner)
		.run(AuditrailRepositoryToken, (repository) => repository.list());

	console.log("acme auditrail     :");
	for (const entry of trail) {
		const actor = entry.actorId === acmeOwner ? "owner " : entry.actorId ? "other " : "system";
		console.log(`  ${actor}  ${entry.action.padEnd(20)} ${JSON.stringify(entry.changes)}`);
	}
	console.log("identity auditrail :", identityTrail.length, "rows visible to runner");
} finally {
	await transactor.close();
}
