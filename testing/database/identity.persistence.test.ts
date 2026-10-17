import { IdentityAccessDockey } from "@app/identity-access/identity-access.dockey";
import { toSignUpUserCommand } from "@app/identity-access/sign-up-user/sign-up-user.schema";
import { type DatabaseHarness, openDatabase } from "@testing/utilities/database.harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PersistenceError } from "@dal/dal.exceptions";
import { RunContext } from "@dal/dal.contexter";
import { TenantId, UserId } from "@core/shared-kernel";
import { uuidv7 } from "uuidv7";

let db: DatabaseHarness;

beforeAll(() => {
	db = openDatabase();
});

afterAll(() => db.close());

describe("create tenant", () => {
	it("yields the tenant and exactly one active owner membership for the creator", async () => {
		const founder = await db.signUp();
		const name = `Store ${uuidv7()}`;
		const tenantId = await db.createTenant(founder, name);

		expect(await db.tenantRows(name)).toHaveLength(1);
		expect(await db.membershipRows(tenantId)).toMatchObject([{ userId: founder, role: "owner", removedAt: null }]);
	});

	it("leaves neither row when the membership insert fails after the tenant insert", async () => {
		const name = `Store ${uuidv7()}`;

		await expect(db.createTenant(UserId.parse(uuidv7()), name)).rejects.toMatchObject({ code: "user_not_found" });

		expect(await db.tenantRows(name)).toHaveLength(0);
	});
});

describe("sign up", () => {
	it("refuses a case or whitespace variant of an existing email", async () => {
		const email = `${uuidv7()}@example.test`;
		const signUp = (value: string) =>
			db.transactor.run(RunContext.system("test"), IdentityAccessDockey.SignUpUser, (handler) =>
				handler.execute(toSignUpUserCommand({ email: value, name: "Ana" })),
			);

		await signUp(email);

		await expect(signUp(`  ${email.toUpperCase()} `)).rejects.toMatchObject({ code: "email_taken" });
	});
});

describe("memberships", () => {
	it("keeps the removed row and creates a new one when the same user rejoins", async () => {
		const { tenantId, founder, others } = await db.seedTenant(["member"]);
		const [member] = others as [UserId];

		await db.transactor.run(RunContext.tenant(tenantId, founder), IdentityAccessDockey.RemoveMember, (handler) =>
			handler.execute({ userId: member }),
		);
		await db.enroll(tenantId, member, "member");

		const rows = (await db.membershipRows(tenantId)).filter((row) => row.userId === member);
		expect(rows).toHaveLength(2);
		expect(rows.filter((row) => row.removedAt === null)).toHaveLength(1);
		expect(rows.filter((row) => row.removedAt !== null)).toHaveLength(1);
	});

	it("rejects a second active membership for the same user and tenant", async () => {
		const { tenantId, others } = await db.seedTenant(["member"]);
		const [member] = others as [UserId];

		const failure = await db.enroll(tenantId, member, "admin").catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(PersistenceError);
		expect(failure).toMatchObject({ kind: "unique", constraint: "memberships_tenant_id_user_id_active_idx" });
	});

	it("reports an unknown tenant from the lock", async () => {
		const founder = await db.signUp();
		const unknown = TenantId.parse(uuidv7());

		const failure = await db.transactor
			.run(RunContext.tenant(unknown, founder), IdentityAccessDockey.LeaveTenant, (handler) => handler.execute())
			.catch((error: unknown) => error);

		expect(failure).toMatchObject({ code: "tenant_not_found" });
	});
});
