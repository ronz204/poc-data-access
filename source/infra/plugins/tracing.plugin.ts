import { Elysia } from "elysia";
import { uuidv7 } from "uuidv7";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

const startedAt = new WeakMap<Request, number>();

export class TracingPlugin {
	static create() {
		return new Elysia({ name: "tracing.plugin" })
			.onRequest(({ request, set }) => {
				const claimed = request.headers.get(REQUEST_ID_HEADER);
				set.headers[REQUEST_ID_HEADER] = claimed && REQUEST_ID_PATTERN.test(claimed) ? claimed : uuidv7();
				startedAt.set(request, performance.now());
			})
			.onAfterResponse({ as: "global" }, ({ request, route, set, responseValue }) => {
				const started = startedAt.get(request);
				console.log(
					JSON.stringify({
						level: "info",
						event: "http.request",
						requestId: set.headers[REQUEST_ID_HEADER],
						method: request.method,
						route,
						status: responseValue instanceof Response ? responseValue.status : set.status,
						durationMs: started === undefined ? null : Math.round(performance.now() - started),
					}),
				);
			});
	}
}
