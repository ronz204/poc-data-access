import { defineConfig } from "drizzle-kit";
import { z } from "zod";

const { POSTGRES_SAMPLER_URL } = z.object({ POSTGRES_SAMPLER_URL: z.url() }).parse(process.env);

export default defineConfig({
	strict: true,
	verbose: true,
	dialect: "postgresql",
	out: "./drizzle/migrations/",
	schema: "./drizzle/database/models/**/*.model.ts",
	schemaFilter: ["platform", "catalog", "sales", "wallet", "messaging", "audit", "reporting"],
	migrations: { schema: "drizzle", table: "migrations" },
	dbCredentials: { url: POSTGRES_SAMPLER_URL },
});
