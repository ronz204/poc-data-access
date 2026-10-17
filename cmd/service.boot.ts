import { IdentityAccessDockey } from "@app/identity-access/identity-access.dockey";
import { servicePlugin } from "@infra/plugins/service.plugin";
import { DataDockey } from "@keys/data.dockey";
import { Container } from "dockdi";
import { env } from "@env";

const MEBIBYTE = 1024 * 1024;

const container = new Container().load(DataDockey.module(), IdentityAccessDockey.module());

const service = servicePlugin(container).listen({
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
