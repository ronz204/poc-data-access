import { ListAuditrailToken } from "@app/auditrail/auditrail.tokens";
import {
	CreateAvailableProjectsToken,
	CreateProjectToken,
	ListProjectsToken,
	RenameProjectToken,
} from "@app/projects/project.tokens";
import { OnboardTenantToken } from "@app/tenants/tenant.tokens";
import { ChangePasswordToken } from "@app/users/user.tokens";
import { InvalidProjectNameError, ProjectSlugTakenError } from "@core/projects/project.errors";
import { Identity } from "@core/shared/identity.helper";
import type { TenantId } from "@core/tenants/tenant.ids";
import type { UserId } from "@core/users/user.ids";
import { PersistenceError } from "@dal/dal.exceptions";
import { TxToken } from "@dal/dal.transactor";
import { projects } from "@db/models/projects.model";
import { Dock } from "@dock";
import { env } from "@env";
import { MissingTokenError } from "dockdi";
import postgres from "postgres";

const transactor = Dock.create(postgres(env.POSTGRES_RUNNER_URL));

const suffix = Identity.next().slice(-6);
const acmeId = Identity.next<TenantId>();
const acmeOwner = Identity.next<UserId>();
const globexId = Identity.next<TenantId>();
const globexOwner = Identity.next<UserId>();

const acme = transactor.forTenant(acmeId).forActor(acmeOwner);
const acmeJob = transactor.forTenant(acmeId);
const globex = transactor.forTenant(globexId).forActor(globexOwner);
const me = transactor.forActor(acmeOwner);

const slugsOf = (page: { items: readonly { slug: string }[] }) => page.items.map((p) => p.slug);

try {
	await acme.run(OnboardTenantToken, (onboard) =>
		onboard.execute({
			name: "Acme",
			slug: `acme-${suffix}`,
			ownerEmail: `owner@acme-${suffix}.dev`,
			ownerName: "Acme Owner",
			passwordHash: "sample",
		}),
	);
	await globex.run(OnboardTenantToken, (onboard) =>
		onboard.execute({
			name: "Globex",
			slug: `globex-${suffix}`,
			ownerEmail: `owner@globex-${suffix}.dev`,
			ownerName: "Globex Owner",
			passwordHash: "sample",
		}),
	);

	const webId = await acme.run(CreateProjectToken, (create) =>
		create.execute({ name: "Web", slug: "web" }),
	);
	await globex.run(CreateProjectToken, (create) => create.execute({ name: "Web", slug: "web" }));

	await acme
		.run(CreateProjectToken, (create) => create.execute({ name: "Web again", slug: "web" }))
		.catch((error) => {
			if (!(error instanceof ProjectSlugTakenError)) throw error;
			console.log("duplicate slug      :", error.message);
		});

	const created = await acme.run(CreateAvailableProjectsToken, (create) =>
		create.execute(["api", "web", "docs"]),
	);
	console.log("savepoints          :", created);

	await acme.run(RenameProjectToken, (rename) => rename.execute(webId, "Website"));

	await acme
		.run(RenameProjectToken, (rename) => rename.execute(webId, "   "))
		.catch((error) => {
			if (!(error instanceof InvalidProjectNameError)) throw error;
			console.log("domain rule         :", error.message);
		});

	await acmeJob.run(CreateProjectToken, (create) =>
		create.execute({ name: "Nightly", slug: "nightly" }),
	);

	await acme
		.run(TxToken, (tx) =>
			tx.insert(projects).values({ tenantId: globexId, name: "Intruder", slug: "intruder" }),
		)
		.catch((error) => {
			if (!(error instanceof PersistenceError)) throw error;
			console.log("cross-tenant (raw)  :", error.kind, error.code);
		});

	const first = await acme.run(ListProjectsToken, (list) =>
		list.execute({
			filter: {},
			sorting: { field: "createdAt", direction: "asc" },
			paging: { limit: 2 },
		}),
	);
	const second = await acme.run(ListProjectsToken, (list) =>
		list.execute({
			filter: {},
			sorting: { field: "createdAt", direction: "asc" },
			paging: { limit: 2, after: first.next ?? undefined },
		}),
	);
	const byName = await acme.run(ListProjectsToken, (list) =>
		list.execute({
			filter: {},
			sorting: { field: "name", direction: "asc" },
			paging: { limit: 10 },
		}),
	);
	const byNamePageOne = await acme.run(ListProjectsToken, (list) =>
		list.execute({
			filter: {},
			sorting: { field: "name", direction: "asc" },
			paging: { limit: 2 },
		}),
	);
	const byNamePageTwo = await acme.run(ListProjectsToken, (list) =>
		list.execute({
			filter: {},
			sorting: { field: "name", direction: "asc" },
			paging: { limit: 2, after: byNamePageOne.next ?? undefined },
		}),
	);
	const search = await acme.run(ListProjectsToken, (list) =>
		list.execute({
			filter: { search: "web" },
			sorting: { field: "createdAt", direction: "desc" },
			paging: { limit: 10 },
		}),
	);
	const globexList = await globex.run(ListProjectsToken, (list) =>
		list.execute({
			filter: {},
			sorting: { field: "createdAt", direction: "asc" },
			paging: { limit: 10 },
		}),
	);

	console.log("page 1 (createdAt)  :", slugsOf(first), "next:", first.next ? "yes" : "no");
	console.log("page 2 (createdAt)  :", slugsOf(second), "next:", second.next ? "yes" : "no");
	console.log(
		"sorted by name      :",
		byName.items.map((p) => p.name),
	);
	console.log(
		"by name, page 2     :",
		byNamePageTwo.items.map((p) => p.name),
	);
	console.log(
		"search 'web'        :",
		search.items.map((p) => p.name),
	);
	console.log("globex sees         :", slugsOf(globexList));

	const noTenantRaw = await transactor.run(TxToken, (tx) => tx.select().from(projects));
	console.log(
		"no tenant (raw)     :",
		noTenantRaw.map((p) => p.slug),
	);

	await transactor
		.run(CreateProjectToken, (create) => create.execute({ name: "Orphan", slug: "orphan" }))
		.catch((error) => {
			if (!(error instanceof MissingTokenError)) throw error;
			console.log("no tenant (create)  :", error.name);
		});

	await me.run(ChangePasswordToken, (change) => change.execute("rotated"));

	await transactor
		.run(ChangePasswordToken, (change) => change.execute("nobody"))
		.catch((error) => {
			if (!(error instanceof MissingTokenError)) throw error;
			console.log("no actor (password) :", error.name);
		});

	const trail = await acme.run(ListAuditrailToken, (list) =>
		list.execute({ paging: { limit: 50 } }),
	);
	const identityTrail = await me.run(ListAuditrailToken, (list) =>
		list.execute({ paging: { limit: 50 } }),
	);

	console.log("acme auditrail      :");
	for (const entry of trail.items) {
		const actor = entry.actorId === acmeOwner ? "owner " : entry.actorId ? "other " : "system";
		console.log(`  ${actor}  ${entry.action.padEnd(20)} ${JSON.stringify(entry.changes)}`);
	}
	console.log("identity auditrail  :", identityTrail.items.length, "rows visible to runner");
} finally {
	await transactor.close();
}
