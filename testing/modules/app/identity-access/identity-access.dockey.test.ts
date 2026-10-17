import type { RunExecutor } from "@dal/dal.transactor";
import { RunContext } from "@dal/dal.contexter";
import { UserId } from "@core/shared-kernel";
import { Container } from "dockdi";
import { beforeAll, describe, expect, it, vi } from "vitest";

type Modules = {
	data: typeof import("@keys/data.dockey");
	system: typeof import("@keys/system.dockey");
	identity: typeof import("@app/identity-access/identity-access.dockey");
	handler: typeof import("@app/identity-access/sign-up-user/sign-up-user.handler");
	createTenant: typeof import("@app/identity-access/create-tenant/create-tenant.handler");
};

let modules: Modules;

beforeAll(async () => {
	vi.stubEnv("POSTGRES_RUNNER_URL", "postgres://runner:runner@127.0.0.1:5432/unused");
	modules = {
		data: await import("@keys/data.dockey"),
		system: await import("@keys/system.dockey"),
		identity: await import("@app/identity-access/identity-access.dockey"),
		handler: await import("@app/identity-access/sign-up-user/sign-up-user.handler"),
		createTenant: await import("@app/identity-access/create-tenant/create-tenant.handler"),
	};
});

function runScope() {
	const container = new Container().load(modules.system.SystemDockey.module(), modules.identity.IdentityAccessDockey.module());
	const scope = container.scope();
	scope.bind(modules.data.DataDockey.Executor).toValue({} as RunExecutor);
	scope.bind(modules.data.DataDockey.Context).toValue(RunContext.platform(UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abc0")));
	return { container, scope };
}

describe("IdentityAccessDockey", () => {
	it("resolves the sign-up handler inside a run scope", () => {
		const { scope } = runScope();
		expect(scope.resolve(modules.identity.IdentityAccessDockey.SignUpUser)).toBeInstanceOf(modules.handler.SignUpUserHandler);
	});

	it("resolves the create-tenant handler with the run's context", () => {
		const { scope } = runScope();
		expect(scope.resolve(modules.identity.IdentityAccessDockey.CreateTenant)).toBeInstanceOf(
			modules.createTenant.CreateTenantHandler,
		);
	});

	it("resolves the admission handler with its query", () => {
		const { scope } = runScope();
		expect(scope.resolve(modules.identity.IdentityAccessDockey.AdmitActor)).toBeDefined();
	});

	it("resolves the member-management handlers", () => {
		const { scope } = runScope();
		const { ChangeRole, RemoveMember, LeaveTenant } = modules.identity.IdentityAccessDockey;
		expect(scope.resolve(ChangeRole)).toBeDefined();
		expect(scope.resolve(RemoveMember)).toBeDefined();
		expect(scope.resolve(LeaveTenant)).toBeDefined();
	});

	it("builds a fresh handler per resolution, because it holds executor-bound repositories", () => {
		const { scope } = runScope();
		const token = modules.identity.IdentityAccessDockey.SignUpUser;
		expect(scope.resolve(token)).not.toBe(scope.resolve(token));
	});
});

describe("SystemDockey", () => {
	it("provides a clock that reads the current time", () => {
		const { container } = runScope();
		const before = Date.now();
		const now = container.resolve(modules.system.SystemDockey.Clock)().getTime();
		expect(now).toBeGreaterThanOrEqual(before);
		expect(now).toBeLessThanOrEqual(Date.now());
	});

	it("provides ids that are valid, distinct and time ordered", () => {
		const { container } = runScope();
		const newId = container.resolve(modules.system.SystemDockey.NewId);
		const first = newId();
		const second = newId();
		expect(UserId.parse(first)).toBe(first);
		expect(second).not.toBe(first);
		expect(second > first).toBe(true);
	});
});
