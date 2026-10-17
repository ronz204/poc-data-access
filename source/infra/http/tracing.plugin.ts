import { Problem } from "./http.problem";
import { Elysia } from "elysia";
import { uuidv7 } from "uuidv7";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

const startedAt = new WeakMap<Request, number>();

export const tracingPlugin = new Elysia({ name: "tracing" })
	.onRequest(({ request, set }) => {
		const claimed = request.headers.get(Problem.requestHeader);
		set.headers[Problem.requestHeader] = claimed && REQUEST_ID_PATTERN.test(claimed) ? claimed : uuidv7();
		startedAt.set(request, performance.now());
	})
	.onAfterResponse({ as: "global" }, ({ request, route, set, responseValue }) => {
		const started = startedAt.get(request);

		console.log(
			JSON.stringify({
				level: "info",
				event: "http.request",
				requestId: Problem.requestId(set),
				method: request.method,
				route,
				status: responseValue instanceof Response ? responseValue.status : set.status,
				durationMs: started === undefined ? null : Math.round(performance.now() - started),
				tenantId: null,
				actorId: null,
			}),
		);
	});
