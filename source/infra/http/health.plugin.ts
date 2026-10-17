import type { Database } from "@keys/data.dockey";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";

const HealthView = z.object({ status: z.enum(["up", "down"]) });

export const healthPlugin = (database: Database) =>
	new Elysia({ prefix: "/health", detail: { tags: ["Health"] } })
		.get("/live", () => ({ status: "up" as const }), { response: { 200: HealthView } })
		.get(
			"/ready",
			async ({ status }) => {
				try {
					await database.execute(sql`select 1`);
					return { status: "up" as const };
				} catch {
					return status(503, { status: "down" as const });
				}
			},
			{ response: { 200: HealthView, 503: HealthView } },
		);
