import { DomainError, EmailError, PrimitiveError } from "@core/shared-kernel";
import { PersistenceError, type PersistenceErrorKind } from "@dal/dal.exceptions";
import { Problem, type ProblemScope, type StatusMap } from "./http.problem";
import { Elysia, type ValidationError } from "elysia";

interface RetryableProblem {
	readonly status: number;
	readonly code: string;
	readonly retryAfter: number;
}

const EMAIL_STATUSES: StatusMap<EmailError["code"]> = { invalid_email: 422 };

const PRIMITIVE_STATUSES: StatusMap<PrimitiveError["code"]> = { invalid_identifier: 422, invalid_literal: 422 };

const RETRYABLE: Partial<Readonly<Record<PersistenceErrorKind, RetryableProblem>>> = {
	contention: { status: 409, code: "contention", retryAfter: 1 },
	timeout: { status: 503, code: "unavailable", retryAfter: 5 },
	unavailable: { status: 503, code: "unavailable", retryAfter: 5 },
};

function issuesOf(error: Readonly<ValidationError>): readonly { path: string; message: string }[] {
	return error.all.map((issue) => {
		const path = Array.isArray(issue.path)
			? issue.path.join(".")
			: String(issue.path ?? "").replace(/^\//, "").replaceAll("/", ".");
		return { path, message: issue.message };
	});
}

function unexpected(scope: ProblemScope, error: unknown): Response {
	console.error(
		JSON.stringify({
			level: "error",
			event: "http.failure",
			requestId: Problem.requestId(scope),
			name: error instanceof Error ? error.name : typeof error,
			message: error instanceof Error ? error.message : String(error),
		}),
	);
	return Problem.respond(scope, { status: 500, code: "internal_error", detail: "the request could not be completed" });
}

export const failuresPlugin = new Elysia({ name: "failures" }).onError({ as: "global" }, ({ code, error, set }) => {
	switch (code) {
		case "VALIDATION":
			return Problem.respond(set, {
				status: 422,
				code: "validation_failed",
				detail: "the request does not match its schema",
				extensions: { issues: issuesOf(error) },
			});
		case "PARSE":
			return Problem.respond(set, { status: 422, code: "validation_failed", detail: "the request body is not valid JSON" });
		case "NOT_FOUND":
			return Problem.respond(set, { status: 404, code: "not_found", detail: "the route does not exist" });
	}

	if (error instanceof EmailError) return Problem.domain(set, error, EMAIL_STATUSES);
	if (error instanceof PrimitiveError) return Problem.domain(set, error, PRIMITIVE_STATUSES);
	if (error instanceof DomainError) return;

	const retryable = error instanceof PersistenceError ? RETRYABLE[error.kind] : undefined;
	if (retryable) return Problem.respond(set, { ...retryable, detail: "the service is busy, retry later" });

	return unexpected(set, error);
});
