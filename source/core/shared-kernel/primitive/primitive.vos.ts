import { PrimitiveError } from "./primitive.errors";

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Uuid<B extends string> = Brand<string, B>;

export interface UuidKind<B extends string> {
	readonly kind: B;
	parse(value: string): Uuid<B>;
	is(value: string): value is Uuid<B>;
}

export function uuidOf<const B extends string>(kind: B): UuidKind<B> {
	return Object.freeze({
		kind,
		parse(value: string): Uuid<B> {
			if (!UUID_PATTERN.test(value)) throw new PrimitiveError("invalid_identifier", { kind });
			return value.toLowerCase() as Uuid<B>;
		},
		is(value: string): value is Uuid<B> {
			return UUID_PATTERN.test(value) && value === value.toLowerCase();
		},
	});
}
