export type PersistenceErrorKind =
	| "unique"
	| "foreign_key"
	| "not_null"
	| "check"
	| "exclusion"
	| "invalid_input"
	| "forbidden"
	| "aborted"
	| "contention"
	| "timeout"
	| "unavailable";

export interface PersistenceErrorDetails {
	readonly code: string | null;
	readonly table: string | null;
	readonly column: string | null;
	readonly constraint: string | null;
}

const RETRYABLE_KINDS: ReadonlySet<PersistenceErrorKind> = new Set([
	"contention",
	"timeout",
	"unavailable",
]);

export class PersistenceError extends Error implements PersistenceErrorDetails {
	readonly retryable: boolean;
	readonly code: string | null;
	readonly table: string | null;
	readonly column: string | null;
	readonly constraint: string | null;

	constructor(
		readonly kind: PersistenceErrorKind,
		details: Partial<PersistenceErrorDetails>,
		cause: unknown,
	) {
		const target = details.constraint ?? details.column;
		super(`${kind} persistence failure${target ? ` on ${target}` : ""}`, { cause });
		this.name = "PersistenceError";
		this.retryable = RETRYABLE_KINDS.has(kind);
		this.code = details.code ?? null;
		this.table = details.table ?? null;
		this.column = details.column ?? null;
		this.constraint = details.constraint ?? null;
	}
}

export class TransactionScopeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TransactionScopeError";
	}
}
