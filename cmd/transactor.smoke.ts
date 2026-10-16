import type { Executor } from "@dal/dal.transactor";
import { PersistenceError, TransactionScopeError } from "@dal/dal.exceptions";
import { tenants } from "@db/models/platform/tenants.model";
import { ViolationTranslator } from "@dal/dal.translator";
import { TenantId, UserId } from "@core/shared-kernel";
import { SlapContext } from "@dal/dal.contexter";
import { DataDockey } from "@keys/data.dockey";
import { Container, token } from "dockdi";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

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

class TenantConflict extends Error {}

const ProbeKey = token<Probe>("Probe");
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

const container = new Container().load(DataDockey.module());
container.bind(ProbeKey).toClass(Probe, DataDockey.Scoped);

const transactor = container.resolve(DataDockey.Transactor);
const created = TenantId.parse(uuidv7());
const rolledBack = TenantId.parse(uuidv7());

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
} finally {
	const database = container.resolve(DataDockey.Database);
	await database.delete(tenants).where(eq(tenants.id, created));
	await database.$client.end();
}

if (failures.length > 0) {
	console.log(`\n${failures.length} check(s) failed`);
	process.exit(1);
}
console.log("\nall checks passed");
