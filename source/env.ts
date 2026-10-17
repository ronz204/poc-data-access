import { z } from "zod";

const schema = z.object({
	POSTGRES_RUNNER_URL: z.url(),
	SERVICE_NAME: z.string().min(1).default("poc-persists-data"),
	SERVICE_PORT: z.coerce.number().int().positive().default(3000),
});

export const env = schema.parse(Bun.env);
