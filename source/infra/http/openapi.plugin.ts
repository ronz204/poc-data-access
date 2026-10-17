import { openapi } from "@elysia/openapi";
import { z } from "zod";

export const openapiPlugin = openapi({
	provider: null,
	specPath: "/v1/openapi.json",
	mapJsonSchema: { zod: z.toJSONSchema },
	documentation: {
		info: { title: "poc-persists-data", version: "1.0.0" },
	},
});
