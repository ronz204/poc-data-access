import { openapi } from "@elysia/openapi";
import { z } from "zod";

export class ScalarsPlugin {
	static create(title: string) {
		return openapi({
			path: "/docs",
			specPath: "/v1/openapi.json",
			mapJsonSchema: { zod: z.toJSONSchema },
			documentation: { info: { title, version: "1.0.0" } },
		});
	}
}
