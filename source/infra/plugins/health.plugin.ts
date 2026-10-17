import { Elysia } from "elysia";

export class HealthPlugin {
	static create(service: string) {
		return new Elysia({ name: "health.plugin" }).get("/health", () => ({ service, status: "healthy" }));
	}
}
