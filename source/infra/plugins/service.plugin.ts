import { identityAccessPlugin } from "@app/identity-access/identity-access.plugin";
import { DataDockey } from "@keys/data.dockey";
import { failuresPlugin } from "./failures.plugin";
import { ScalarsPlugin } from "./scalars.plugin";
import { tracingPlugin } from "./tracing.plugin";
import { HealthPlugin } from "./health.plugin";
import type { Container } from "dockdi";
import { env } from "@env";
import { Elysia } from "elysia";

export const servicePlugin = (container: Container) => {
	const transactor = container.resolve(DataDockey.Transactor);

	return new Elysia()
		.use(tracingPlugin)
		.use(failuresPlugin)
		.use(ScalarsPlugin.create(env.SERVICE_NAME))
		.use(HealthPlugin.create(env.SERVICE_NAME))
		.group("/v1", (v1) => v1.use(identityAccessPlugin(transactor)));
};
