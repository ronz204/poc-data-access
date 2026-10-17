import { ScalarsPlugin } from "@infra/plugins/scalars.plugin";
import { call, postJson } from "@testing/utilities/http.harness";
import { Elysia } from "elysia";
import { z } from "zod";
import { describe, expect, it } from "vitest";

const app = new Elysia()
	.use(ScalarsPlugin.create("shop"))
	.post("/v1/echo", ({ body }) => body, { body: z.object({ name: z.string() }) });

describe("ScalarsPlugin", () => {
	it("serves the OpenAPI document at the spec path under the given title", async () => {
		const reply = await call(app, "/v1/openapi.json");
		expect(reply.status).toBe(200);
		expect(reply.body.info.title).toBe("shop");
	});

	it("describes a zod body from its schema", async () => {
		const reply = await call(app, "/v1/openapi.json");
		const schema = reply.body.paths["/v1/echo"].post.requestBody.content["application/json"].schema;
		expect(schema.properties.name).toMatchObject({ type: "string" });
		expect(schema.required).toContain("name");
	});

	it("serves the documentation page", async () => {
		const reply = await call(app, "/docs");
		expect(reply.status).toBe(200);
	});

	it("still routes the documented endpoint", async () => {
		const reply = await call(app, "/v1/echo", postJson({ name: "a" }));
		expect(reply.body).toEqual({ name: "a" });
	});
});
