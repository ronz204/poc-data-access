import { UserError } from "@core/identity-access";
import { UserId } from "@core/shared-kernel";
import { domainProblem, ErrorsPlugin, type StatusMap } from "@infra/plugins/errors.plugin";
import { TracingPlugin } from "@infra/plugins/tracing.plugin";
import { call, captureLogs, postJson } from "@testing/utilities/http.harness";
import { Elysia } from "elysia";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const USER_STATUSES: StatusMap<UserError["code"]> = { invalid_name: 422, email_taken: 409 };

const contextual = new Elysia()
	.onError({ as: "scoped" }, ({ error, set }) => {
		if (error instanceof UserError) return domainProblem(set, error, USER_STATUSES);
	})
	.get("/taken", () => {
		throw new UserError("email_taken");
	});

const app = new Elysia()
	.use(TracingPlugin.create())
	.use(ErrorsPlugin.create())
	.post("/echo", ({ body }) => body, { body: z.object({ name: z.string(), age: z.number() }) })
	.get("/bad-id", () => UserId.parse("nope"))
	.get("/boom", () => {
		throw new Error("select * from secrets where password = 'hunter2'");
	})
	.get("/unmapped", () => {
		throw new UserError("invalid_name", { maxLength: 120 });
	})
	.use(contextual);

describe("ErrorsPlugin", () => {
	let logs: ReturnType<typeof captureLogs>;
	let errors: ReturnType<typeof captureLogs>;
	beforeEach(() => {
		logs = captureLogs();
		errors = captureLogs("error");
	});
	afterEach(() => {
		logs.restore();
		errors.restore();
	});

	it("answers problem+json with the request id", async () => {
		const reply = await call(app, "/missing", { headers: { "x-request-id": "client-id-12345" } });
		expect(reply.status).toBe(404);
		expect(reply.headers.get("content-type")).toBe("application/problem+json");
		expect(reply.body).toEqual({
			status: 404,
			code: "not_found",
			detail: "the route does not exist",
			requestId: "client-id-12345",
		});
	});

	it("reports every schema issue with its path", async () => {
		const reply = await call(app, "/echo", postJson({ name: 1 }));
		expect(reply.status).toBe(422);
		expect(reply.body.code).toBe("validation_failed");
		const paths = reply.body.issues.map((issue: { path: string }) => issue.path);
		expect(paths).toHaveLength(2);
		expect(paths.join(",")).toContain("name");
		expect(paths.join(",")).toContain("age");
	});

	it("rejects a body that is not JSON", async () => {
		const reply = await call(app, "/echo", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
		expect(reply.status).toBe(422);
		expect(reply.body.code).toBe("validation_failed");
	});

	it("maps a shared-kernel domain error with its details", async () => {
		const reply = await call(app, "/bad-id");
		expect(reply.status).toBe(422);
		expect(reply.body).toMatchObject({ code: "invalid_identifier", details: { kind: "UserId" } });
	});

	it("maps a context domain error through its own scoped handler", async () => {
		const reply = await call(app, "/taken");
		expect(reply.status).toBe(409);
		expect(reply.body.code).toBe("email_taken");
	});

	it("hides the internals of an unexpected failure and logs them", async () => {
		const reply = await call(app, "/boom");
		expect(reply.status).toBe(500);
		expect(reply.body.code).toBe("internal_error");
		expect(JSON.stringify(reply.body)).not.toContain("secrets");
		expect(errors.lines()[0]).toMatchObject({ event: "http.failure", message: expect.stringContaining("secrets") });
	});

	it("leaves a domain error no context maps to the framework default: 500 with only its message", async () => {
		const reply = await call(app, "/unmapped");
		expect(reply.status).toBe(500);
		expect(reply.body).toBe("the name must not be empty and must fit the maximum length");
	});
});
