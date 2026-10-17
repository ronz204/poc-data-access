import type { DomainError } from "@core/shared-kernel";

export interface ProblemScope {
	readonly headers: Readonly<Record<string, unknown>>;
	status?: unknown;
}

export interface ProblemInit {
	readonly status: number;
	readonly code: string;
	readonly detail: string;
	readonly retryAfter?: number;
	readonly extensions?: Readonly<Record<string, unknown>>;
}

export type StatusMap<C extends string> = Readonly<Record<C, number>>;

const TITLES: Readonly<Record<number, string>> = {
	400: "Bad Request",
	403: "Forbidden",
	404: "Not Found",
	409: "Conflict",
	422: "Unprocessable Content",
	500: "Internal Server Error",
	503: "Service Unavailable",
};

export class Problem {
	static readonly requestHeader = "x-request-id";

	static requestId(scope: ProblemScope): string | null {
		const value = scope.headers[Problem.requestHeader];
		return typeof value === "string" ? value : null;
	}

	static respond(scope: ProblemScope, init: ProblemInit): Response {
		scope.status = init.status;
		const headers = new Headers({ "content-type": "application/problem+json" });
		if (init.retryAfter) headers.set("retry-after", String(init.retryAfter));

		const body = {
			type: "about:blank",
			title: TITLES[init.status] ?? "Error",
			status: init.status,
			detail: init.detail,
			code: init.code,
			requestId: Problem.requestId(scope),
			...init.extensions,
		};
		return new Response(JSON.stringify(body), { status: init.status, headers });
	}

	static domain<C extends string>(scope: ProblemScope, error: DomainError<C>, statuses: StatusMap<C>): Response {
		const extensions = Object.keys(error.details).length ? { details: error.details } : undefined;
		return Problem.respond(scope, { status: statuses[error.code], code: error.code, detail: error.message, extensions });
	}
}
