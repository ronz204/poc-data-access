import { z } from "zod";

const envSchema = z.object({
	// ==========================================
	// ====== PostgreSQL Datastore
	// ==========================================
	POSTGRES_SAMPLER_URL: z.url().min(1),
	POSTGRES_RUNNER_URL: z.url().min(1),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
