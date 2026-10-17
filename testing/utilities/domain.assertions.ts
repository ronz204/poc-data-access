import { DomainError } from "@core/shared-kernel";
import { expect } from "vitest";

export function expectDomainError(action: () => unknown, code: string, details?: Record<string, unknown>): DomainError {
	let thrown: unknown;
	try {
		action();
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(DomainError);
	const error = thrown as DomainError;
	expect(error.code).toBe(code);
	if (details) expect(error.details).toEqual(details);
	return error;
}
