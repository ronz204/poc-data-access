import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";
import { PersistenceError, type PersistenceErrorKind } from "./dal.exceptions";

const SQLSTATE_CODES: Readonly<Record<string, PersistenceErrorKind>> = {
	"23505": "unique",
	"23503": "foreign_key",
	"23502": "not_null",
	"23514": "check",
	"23P01": "exclusion",
	"22P02": "invalid_input",
	"22001": "invalid_input",
	"22003": "invalid_input",
	"22007": "invalid_input",
	"22008": "invalid_input",
	"42501": "forbidden",
	"25P02": "aborted",
	"40001": "contention",
	"40P01": "contention",
	"55P03": "contention",
	"57014": "timeout",
	"57P01": "unavailable",
	"57P03": "unavailable",
};

const SQLSTATE_CLASSES: Readonly<Record<string, PersistenceErrorKind>> = {
	"08": "unavailable",
	"53": "unavailable",
};

const CONNECTION_CODES: ReadonlySet<string> = new Set([
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	"CONNECT_TIMEOUT",
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EPIPE",
]);

export class ErrorClassifier {
	static classify(error: unknown): PersistenceError | null {
		if (error instanceof PersistenceError) return error;

		const source = error instanceof DrizzleQueryError ? error.cause : error;

		if (source instanceof postgres.PostgresError) {
			const kind = SQLSTATE_CODES[source.code] ?? SQLSTATE_CLASSES[source.code.slice(0, 2)];
			if (!kind) return null;

			return new PersistenceError(
				kind,
				{
					code: source.code,
					table: source.table_name,
					column: source.column_name,
					constraint: source.constraint_name,
				},
				error,
			);
		}

		const code = (source as { code?: unknown } | null)?.code;
		return typeof code === "string" && CONNECTION_CODES.has(code)
			? new PersistenceError("unavailable", { code }, error)
			: null;
	}

	static normalize(error: unknown): unknown {
		return ErrorClassifier.classify(error) ?? error;
	}
}
