import { defineConfig } from "drizzle-kit";

export default defineConfig({
	strict: true,
	verbose: true,
	dialect: "postgresql",
	out: "./drizzle/migrations/",
	schema: "./drizzle/database/models/*.model.ts",
	migrations: { schema: "drizzle", table: "migrations" },
	dbCredentials: { url: process.env.POSTGRES_SAMPLER_URL! },
});
