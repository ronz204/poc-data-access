import { TracingPlugin } from "@infra/plugins/tracing.plugin";
import { call, captureLogs } from "@testing/utilities/http.harness";
import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const app = new Elysia().use(TracingPlugin.create()).get("/ping", () => "pong");

describe("TracingPlugin", () => {
	let logs: ReturnType<typeof captureLogs>;
	beforeEach(() => {
		logs = captureLogs();
	});
	afterEach(() => logs.restore());

	it("echoes a well formed request id", async () => {
		const reply = await call(app, "/ping", { headers: { "x-request-id": "client-id-12345" } });
		expect(reply.headers.get("x-request-id")).toBe("client-id-12345");
	});

	it("generates an id when none is sent", async () => {
		const reply = await call(app, "/ping");
		expect(reply.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
	});

	it.each(["short", "has spaces in it", "x".repeat(129), "bad/chars/here"])("replaces the malformed id %j", async (claimed) => {
		const reply = await call(app, "/ping", { headers: { "x-request-id": claimed } });
		expect(reply.headers.get("x-request-id")).not.toBe(claimed);
		expect(reply.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("logs one structured line per request", async () => {
		const reply = await call(app, "/ping", { headers: { "x-request-id": "client-id-12345" } });
		expect(reply.status).toBe(200);
		expect(logs.lines()).toEqual([
			{
				level: "info",
				event: "http.request",
				requestId: "client-id-12345",
				method: "GET",
				route: "/ping",
				status: 200,
				durationMs: expect.any(Number),
			},
		]);
	});

	it("logs an unknown route too", async () => {
		const reply = await call(app, "/missing");
		expect(reply.status).toBe(404);
		expect(logs.lines()).toHaveLength(1);
		expect(logs.lines()[0]).toMatchObject({ event: "http.request", status: 404 });
	});
});
