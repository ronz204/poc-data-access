import { z } from "zod";

const schema = z.object({
	POSTGRES_SAMPLER_URL: z.url(),
	POSTGRES_RUNNER_URL: z.url(),
	POSTGRES_RELAYER_URL: z.url(),
	SERVICE_PORT: z.coerce.number().int().positive().default(3000),
});

export const env = schema.parse(Bun.env);
