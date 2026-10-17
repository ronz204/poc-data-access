import { IdentityAccessDockey } from "@app/identity-access/identity-access.dockey";
import { Membership, MembershipId, type MembershipRole } from "@core/identity-access";
import { toCreateTenantCommand } from "@app/identity-access/create-tenant/create-tenant.schema";
import { toSignUpUserCommand } from "@app/identity-access/sign-up-user/sign-up-user.schema";
import { memberships } from "@db/models/platform/memberships.model";
import { tenants } from "@db/models/platform/tenants.model";
import { DataDockey } from "@keys/data.dockey";
import { SystemDockey } from "@keys/system.dockey";
import { RunContext } from "@dal/dal.contexter";
import { TenantId, UserId } from "@core/shared-kernel";
import type { Transactor } from "@dal/dal.transactor";
import { Container } from "dockdi";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

export interface SeededTenant {
	readonly tenantId: TenantId;
	readonly founder: UserId;
	readonly others: readonly UserId[];
}

export interface DatabaseHarness {
	readonly container: Container;
	readonly transactor: Transactor;
	signUp(): Promise<UserId>;
	createTenant(founder: UserId, name?: string): Promise<TenantId>;
	enroll(tenantId: TenantId, userId: UserId, role: MembershipRole): Promise<void>;
	seedTenant(otherRoles: readonly MembershipRole[]): Promise<SeededTenant>;
	membershipRows(tenantId: TenantId): Promise<readonly (typeof memberships.$inferSelect)[]>;
	tenantRows(name: string): Promise<readonly (typeof tenants.$inferSelect)[]>;
	activeOwners(tenantId: TenantId): Promise<number>;
	close(): Promise<void>;
}

// Rows are never deleted: every scenario creates its own users and tenants with fresh ids and unique emails.
export function openDatabase(): DatabaseHarness {
	const container = new Container().load(SystemDockey.module(), DataDockey.module(), IdentityAccessDockey.module());
	const transactor = container.resolve(DataDockey.Transactor);
	const database = container.resolve(DataDockey.Database);

	const signUp = async () => {
		const command = toSignUpUserCommand({ email: `${uuidv7()}@example.test`, name: "Member" });
		const user = await transactor.run(RunContext.system("test"), IdentityAccessDockey.SignUpUser, (h) => h.execute(command));
		return UserId.parse(user.id);
	};

	const createTenant = async (founder: UserId, name = `Store ${uuidv7()}`) => {
		const command = toCreateTenantCommand({ name });
		const tenant = await transactor.run(RunContext.platform(founder), IdentityAccessDockey.CreateTenant, (h) =>
			h.execute(command),
		);
		return TenantId.parse(tenant.id);
	};

	const enroll = (tenantId: TenantId, userId: UserId, role: MembershipRole) =>
		transactor.run(RunContext.tenant(tenantId, userId), IdentityAccessDockey.MembershipRepository, (repository) =>
			repository.insert(
				Membership.enrollOwner({ id: MembershipId.parse(uuidv7()), tenantId, userId }, new Date()).changeRole(role),
			),
		);

	const membershipRows = (tenantId: TenantId) =>
		database.select().from(memberships).where(eq(memberships.tenantId, tenantId));

	return {
		container,
		transactor,
		signUp,
		createTenant,
		enroll,
		async seedTenant(otherRoles) {
			const founder = await signUp();
			const tenantId = await createTenant(founder);
			const others = await Promise.all(otherRoles.map(() => signUp()));
			for (const [index, userId] of others.entries()) await enroll(tenantId, userId, otherRoles[index] as MembershipRole);
			return { tenantId, founder, others };
		},
		membershipRows,
		tenantRows: (name) => database.select().from(tenants).where(eq(tenants.name, name)),
		activeOwners: async (tenantId) =>
			(await membershipRows(tenantId)).filter((row) => row.role === "owner" && row.removedAt === null).length,
		close: async () => {
			await database.$client.end();
		},
	};
}
