import { identityAccessPlugin } from "@app/identity-access/identity-access.plugin";
import { DataDockey } from "@keys/data.dockey";
import { failuresPlugin } from "./failures.plugin";
import { openapiPlugin } from "./openapi.plugin";
import { tracingPlugin } from "./tracing.plugin";
import { healthPlugin } from "./health.plugin";
import type { Container } from "dockdi";
import { Elysia } from "elysia";

export const servicePlugin = (container: Container) => {
	const transactor = container.resolve(DataDockey.Transactor);
	const database = container.resolve(DataDockey.Database);

	return new Elysia()
		.use(tracingPlugin)
		.use(failuresPlugin)
		.use(openapiPlugin)
		.use(healthPlugin(database))
		.group("/v1", (v1) => v1.use(identityAccessPlugin(transactor)));
};
