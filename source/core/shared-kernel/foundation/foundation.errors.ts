export type ErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export type ErrorMessages = Readonly<Record<string, string>>;

export abstract class DomainError<C extends string = string> extends Error {
	protected constructor(
		readonly code: C,
		message: string,
		readonly details: ErrorDetails = {},
	) {
		super(message);
		this.name = new.target.name;
	}

	static define<const M extends ErrorMessages>(messages: M) {
		type Code = Extract<keyof M, string>;

		abstract class DefinedError extends DomainError<Code> {
			constructor(code: Code, details?: ErrorDetails) {
				super(code, messages[code] as string, details);
			}
		}

		return DefinedError;
	}
}
