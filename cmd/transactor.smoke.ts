import type { TenantEntrance } from "@dal/dal.entrance";
import type { Executor } from "@dal/dal.transactor";
import { PersistenceError, TransactionScopeError } from "@dal/dal.exceptions";
import { tenants } from "@db/models/platform/tenants.model";
import { trailer } from "@db/models/platform/trailer.model";
import { ViolationTranslator } from "@dal/dal.translator";
import { TenantId, UserId } from "@core/shared-kernel";
import { SlapContext } from "@dal/dal.contexter";
import { DataDockey } from "@keys/data.dockey";
import { Container, token } from "dockdi";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import postgres from "postgres";
import { env } from "@env";

class Probe {
	constructor(
		readonly slap: Executor,
		readonly context: SlapContext,
	) {}

	async settings() {
		const [row] = await this.slap.execute<{ tenant: string; actor: string; origin: string }>(
			sql`select current_setting('app.tenant', true) as tenant,
				current_setting('app.actor', true) as actor,
				current_setting('app.origin', true) as origin`,
		);
		return row;
	}

	insert(id: string) {
		return this.slap.insert(tenants).values({ id, name: "smoke", createdAt: new Date() });
	}

	async count(id: string) {
		const rows = await this.slap.select().from(tenants).where(eq(tenants.id, id));
		return rows.length;
	}
}

// What the handler that creates a tenant will look like: it lists the entrance explicitly, because
// it is not part of the default scoped dependencies.
class Founder extends Probe {
	constructor(
		slap: Executor,
		context: SlapContext,
		readonly entrance: TenantEntrance,
	) {
		super(slap, context);
	}

	record(tenantId: string, actorId: string) {
		return this.slap.insert(trailer).values({
			id: uuidv7(),
			tenantId,
			actorId,
			origin: "request",
			action: "tenant.created",
			entityType: "tenant",
			entityId: tenantId,
		});
	}
}

class TenantConflict extends Error {}

const ProbeKey = token<Probe>("Probe");
const FounderKey = token<Founder>("Founder");
const failures: string[] = [];

function check(name: string, passed: boolean, detail?: unknown): void {
	console.log(`${passed ? "ok  " : "FAIL"} ${name}`);
	if (!passed) failures.push(name);
	if (!passed && detail !== undefined) console.log("     ", detail);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return undefined;
	} catch (error) {
		return error;
	}
}

const tenantId = TenantId.parse(uuidv7());
const actorId = UserId.parse(uuidv7());
const request = SlapContext.tenant(tenantId, actorId);
const platform = SlapContext.platform(actorId);
const system = SlapContext.system("smoke");

// contexts: no database needed
check("a tenant context returns its tenant and actor", request.tenant === tenantId && request.actor === actorId);
const noTenant = await rejection(Promise.resolve().then(() => platform.tenant));
check("a platform context has no tenant", noTenant instanceof TransactionScopeError, noTenant);
const noActor = await rejection(Promise.resolve().then(() => system.actor));
check("a system context has no actor", noActor instanceof TransactionScopeError, noActor);
const fork = request.fork();
check("a fork copies the context without sharing it", fork !== request && fork.tenantId === tenantId && fork.actorId === actorId);

const container = new Container().load(DataDockey.module());
container.bind(ProbeKey).toClass(Probe, DataDockey.Scoped);
container.bind(FounderKey).toClass(Founder, [...DataDockey.Scoped, DataDockey.Entrance]);

const transactor = container.resolve(DataDockey.Transactor);
const created = TenantId.parse(uuidv7());
const rolledBack = TenantId.parse(uuidv7());
const founded = TenantId.parse(uuidv7());
const abandoned = TenantId.parse(uuidv7());

// The application role cannot delete, so the script cleans up as the owner of the tables.
const owner = postgres(env.POSTGRES_SAMPLER_URL, { max: 1, onnotice: () => {} });

try {
	// settings are applied inside the run and reverted after it
	const inside = await transactor.run(request, ProbeKey, (probe) => probe.settings());
	check(
		"tenant, actor and origin are set inside the transaction",
		inside?.tenant === tenantId && inside.actor === actorId && inside.origin === "request",
		inside,
	);

	const outside = await transactor.run(system, ProbeKey, (probe) => probe.settings());
	check(
		"a system run sets no tenant and no actor",
		outside?.tenant === "" && outside.actor === "" && outside.origin === "smoke",
		outside,
	);

	// a unique violation arrives classified, and the translator maps it
	await transactor.run(platform, ProbeKey, (probe) => probe.insert(created));
	const unique = await rejection(transactor.run(platform, ProbeKey, (probe) => probe.insert(created)));
	check(
		"a unique violation becomes a PersistenceError",
		unique instanceof PersistenceError && unique.kind === "unique" && unique.constraint === "tenants_pkey",
		unique,
	);

	const translated = await rejection(
		transactor.run(platform, ProbeKey, (probe) =>
			ViolationTranslator.translate(probe.insert(created), { tenants_pkey: () => new TenantConflict("tenant exists") }),
		),
	);
	check("the translator maps the constraint to a domain error", translated instanceof TenantConflict, translated);

	// a failure inside the work rolls back
	await rejection(
		transactor.run(platform, ProbeKey, async (probe) => {
			await probe.insert(rolledBack);
			throw new Error("boom");
		}),
	);
	const survivors = await transactor.run(platform, ProbeKey, (probe) => probe.count(rolledBack));
	check("a failure inside the work rolls the transaction back", survivors === 0, survivors);

	// entering a tenant: the audit trail is the proof, because its policy compares the entry's tenant
	// with the transaction's setting
	const refused = await rejection(
		transactor.run(platform, FounderKey, async (founder) => {
			await founder.insert(founded);
			await founder.record(founded, actorId);
		}),
	);
	check(
		"an audit entry for a new tenant is refused before entering it",
		refused instanceof PersistenceError && refused.kind === "forbidden",
		refused,
	);

	const entered = await transactor.run(platform, FounderKey, async (founder) => {
		const held = founder.context;
		const before = held.tenantId;
		await founder.insert(founded);
		await founder.entrance.enter(founded);
		await founder.record(founded, actorId);
		return { before, after: held.tenantId, settings: await founder.settings() };
	});
	check(
		"entering a tenant updates the context every holder shares",
		entered.before === null && entered.after === founded,
		entered,
	);
	check(
		"entering a tenant re-applies the setting and keeps actor and origin",
		entered.settings?.tenant === founded && entered.settings.actor === actorId && entered.settings.origin === "request",
		entered.settings,
	);

	const [kept] = await owner<{ tenants: string; trail: string }[]>`
		select (select count(*) from platform.tenants where id = ${founded}) as tenants,
			(select count(*) from platform.trailer where tenant_id = ${founded}) as trail`;
	check(
		"the tenant and its audit entry commit together",
		Number(kept?.tenants) === 1 && Number(kept?.trail) === 1,
		kept,
	);

	const next = await transactor.run(platform, ProbeKey, (probe) => probe.settings());
	check(
		"the next run with the same context starts without a tenant",
		next?.tenant === "" && platform.tenantId === null,
		{ next, tenant: platform.tenantId },
	);

	const twice = await rejection(
		transactor.run(platform, FounderKey, async (founder) => {
			const id = TenantId.parse(uuidv7());
			await founder.insert(id);
			await founder.entrance.enter(id);
			await founder.entrance.enter(id);
		}),
	);
	check("a run enters a tenant only once", twice instanceof TransactionScopeError, twice);

	const fromTenant = await rejection(
		transactor.run(request, FounderKey, (founder) => founder.entrance.enter(TenantId.parse(uuidv7()))),
	);
	check("a tenant run cannot enter a tenant", fromTenant instanceof TransactionScopeError, fromTenant);

	const fromSystem = await rejection(
		transactor.run(system, FounderKey, (founder) => founder.entrance.enter(TenantId.parse(uuidv7()))),
	);
	check("a system run cannot enter a tenant", fromSystem instanceof TransactionScopeError, fromSystem);

	const earlier = await rejection(transactor.run(platform, FounderKey, (founder) => founder.entrance.enter(created)));
	check("a tenant created by an earlier transaction cannot be entered", earlier instanceof TransactionScopeError, earlier);

	const unknown = await rejection(
		transactor.run(platform, FounderKey, (founder) => founder.entrance.enter(TenantId.parse(uuidv7()))),
	);
	check("an unknown tenant cannot be entered", unknown instanceof TransactionScopeError, unknown);

	await rejection(
		transactor.run(platform, FounderKey, async (founder) => {
			await founder.insert(abandoned);
			await founder.entrance.enter(abandoned);
			await founder.record(abandoned, actorId);
			throw new Error("boom");
		}),
	);
	const [gone] = await owner<{ tenants: string; trail: string }[]>`
		select (select count(*) from platform.tenants where id = ${abandoned}) as tenants,
			(select count(*) from platform.trailer where tenant_id = ${abandoned}) as trail`;
	check(
		"a failure after entering rolls the tenant and its audit entry back",
		Number(gone?.tenants) === 0 && Number(gone?.trail) === 0,
		gone,
	);
} finally {
	const ids = [created, rolledBack, founded, abandoned];
	await owner`delete from platform.trailer where tenant_id in ${owner(ids)}`;
	await owner`delete from platform.tenants where id in ${owner(ids)}`;
	await owner.end();
	await container.resolve(DataDockey.Database).$client.end();
}

if (failures.length > 0) {
	console.log(`\n${failures.length} check(s) failed`);
	process.exit(1);
}
console.log("\nall checks passed");
