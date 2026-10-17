import { IdentityAccessDockey } from "@app/identity-access/identity-access.dockey";
import { identityAccessPlugin } from "@app/identity-access/identity-access.plugin";
import { ScalarsPlugin } from "@infra/plugins/scalars.plugin";
import { TracingPlugin } from "@infra/plugins/tracing.plugin";
import { HealthPlugin } from "@infra/plugins/health.plugin";
import { ErrorsPlugin } from "@infra/plugins/errors.plugin";
import { SystemDockey } from "@keys/system.dockey";
import { DataDockey } from "@keys/data.dockey";
import { Container } from "dockdi";
import { Elysia } from "elysia";
import { env } from "@env";

const MEBIBYTE = 1024 * 1024;

const container = new Container().load(SystemDockey.module(), DataDockey.module(), IdentityAccessDockey.module());

const transactor = container.resolve(DataDockey.Transactor);

const service = new Elysia()
	.use(TracingPlugin.create())
	.use(ErrorsPlugin.create())
	.use(ScalarsPlugin.create(env.SERVICE_NAME))
	.use(HealthPlugin.create(env.SERVICE_NAME))
	.group("/v1", (v1) => v1.use(identityAccessPlugin(transactor)))
	.listen({
		port: env.SERVICE_PORT,
		maxRequestBodySize: MEBIBYTE,
		idleTimeout: 30,
	});

console.log(JSON.stringify({ level: "info", event: "service.started", port: env.SERVICE_PORT }));

async function shutdown(signal: string): Promise<void> {
	console.log(JSON.stringify({ level: "info", event: "service.stopping", signal }));
	await service.stop();
	await container.resolve(DataDockey.Database).$client.end();
	process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
