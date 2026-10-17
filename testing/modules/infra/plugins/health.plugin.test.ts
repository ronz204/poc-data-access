import { HealthPlugin } from "@infra/plugins/health.plugin";
import { call } from "@testing/utilities/http.harness";
import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";

describe("HealthPlugin", () => {
	it("reports the service as healthy under its own name", async () => {
		const reply = await call(new Elysia().use(HealthPlugin.create("shop")), "/health");
		expect(reply.status).toBe(200);
		expect(reply.body).toEqual({ service: "shop", status: "healthy" });
	});
});
