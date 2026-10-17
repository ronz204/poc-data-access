import { defineConfig } from "vitest/config";

try {
	process.loadEnvFile(".env");
} catch {
	// the connection string may already come from the environment
}

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["testing/database/**/*.test.ts"],
		environment: "node",
		testTimeout: 30_000,
		hookTimeout: 30_000,
		fileParallelism: false,
	},
});
