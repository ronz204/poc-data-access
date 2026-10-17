import { AdmissionError, DomainError, PaginationError, PrimitiveError } from "@core/shared-kernel";
import { Elysia, type ValidationError } from "elysia";
import { REQUEST_ID_HEADER } from "./tracing.plugin";

export type StatusMap<C extends string> = Readonly<Record<C, number>>;

export interface ProblemScope {
	readonly headers: Readonly<Record<string, unknown>>;
}

export function problem(
	scope: ProblemScope,
	status: number,
	code: string,
	detail: string,
	extensions?: Readonly<Record<string, unknown>>,
): Response {
	const body = { status, code, detail, requestId: scope.headers[REQUEST_ID_HEADER], ...extensions };
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/problem+json" },
	});
}

export function domainProblem<C extends string>(
	scope: ProblemScope,
	error: DomainError<C>,
	statuses: StatusMap<C>,
): Response {
	const details = Object.keys(error.details).length ? { details: error.details } : undefined;
	return problem(scope, statuses[error.code], error.code, error.message, details);
}

const SHARED_STATUSES: StatusMap<PrimitiveError["code"] | AdmissionError["code"] | PaginationError["code"]> = {
	invalid_identifier: 422,
	invalid_literal: 422,
	invalid_email: 422,
	not_a_member: 403,
	insufficient_role: 403,
	invalid_cursor: 422,
};

function issuesOf(error: Readonly<ValidationError>) {
	return error.all.map((issue) => ({ path: String(issue.path ?? ""), message: issue.message }));
}

function logFailure(requestId: unknown, error: unknown): void {
	console.error(
		JSON.stringify({
			level: "error",
			event: "http.failure",
			requestId,
			name: error instanceof Error ? error.name : typeof error,
			message: error instanceof Error ? error.message : String(error),
		}),
	);
}

export class ErrorsPlugin {
	static create() {
		return new Elysia({ name: "errors.plugin" }).onError({ as: "global" }, ({ code, error, set }) => {
			switch (code) {
				case "VALIDATION":
					return problem(set, 422, "validation_failed", "the request does not match its schema", {
						issues: issuesOf(error),
					});
				case "PARSE":
					return problem(set, 422, "validation_failed", "the request body is not valid JSON");
				case "NOT_FOUND":
					return problem(set, 404, "not_found", "the route does not exist");
			}

			if (error instanceof PrimitiveError || error instanceof AdmissionError || error instanceof PaginationError) {
				return domainProblem(set, error, SHARED_STATUSES);
			}

			if (error instanceof DomainError) return;
			logFailure(set.headers[REQUEST_ID_HEADER], error);
			return problem(set, 500, "internal_error", "the request could not be completed");
		});
	}
}
