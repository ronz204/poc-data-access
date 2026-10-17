import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["testing/modules/**/*.test.ts"],
		environment: "node",
	},
});
