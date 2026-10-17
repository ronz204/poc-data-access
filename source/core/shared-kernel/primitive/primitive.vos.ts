import type { DomainError } from "../foundation/foundation.errors";
import { PrimitiveError } from "./primitive.errors";

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export interface BrandKind<B extends string> {
	readonly kind: B;
	parse(value: string): Brand<string, B>;
	is(value: unknown): value is Brand<string, B>;
}

export interface LiteralKind<K extends string, L extends string> {
	readonly kind: K;
	readonly values: readonly L[];
	parse(value: string): L;
	is(value: unknown): value is L;
}

export type Infer<K extends { parse(value: never): unknown }> = ReturnType<K["parse"]>;

export type TextLimits = {
	readonly minLength: number;
	readonly maxLength: number;
};

export interface TextRules {
	readonly min?: number;
	readonly max: number;
	readonly pattern?: RegExp;
	readonly normalize?: (value: string) => string;
	readonly fail: (limits: TextLimits) => DomainError;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function uuidOf<const B extends string>(kind: B): BrandKind<B> {
	return Object.freeze({
		kind,
		parse(value: string): Brand<string, B> {
			const normalized = value.toLowerCase();
			if (!UUID_PATTERN.test(normalized)) throw new PrimitiveError("invalid_identifier", { kind });
			return normalized as Brand<string, B>;
		},
		is(value: unknown): value is Brand<string, B> {
			return typeof value === "string" && UUID_PATTERN.test(value);
		},
	});
}

export function textOf<const B extends string>(kind: B, rules: TextRules): BrandKind<B> {
	const limits: TextLimits = { minLength: rules.min ?? 1, maxLength: rules.max };
	const normalize = (value: string) => (rules.normalize ? rules.normalize(value.trim()) : value.trim());
	const valid = (value: string) =>
		value.length >= limits.minLength && value.length <= limits.maxLength && (rules.pattern?.test(value) ?? true);

	return Object.freeze({
		kind,
		parse(value: string): Brand<string, B> {
			const normalized = normalize(value);
			if (!valid(normalized)) throw rules.fail(limits);
			return normalized as Brand<string, B>;
		},
		is(value: unknown): value is Brand<string, B> {
			return typeof value === "string" && valid(value) && normalize(value) === value;
		},
	});
}

export function literalsOf<const K extends string, const L extends string>(
	kind: K,
	values: readonly L[],
	fail: () => DomainError = () => new PrimitiveError("invalid_literal", { kind }),
): LiteralKind<K, L> {
	const allowed: ReadonlySet<string> = new Set(values);
	const is = (value: unknown): value is L => typeof value === "string" && allowed.has(value);

	return Object.freeze({
		kind,
		values: Object.freeze([...values]),
		parse(value: string): L {
			if (!is(value)) throw fail();
			return value;
		},
		is,
	});
}

export const Email = textOf("Email", {
	max: 254,
	pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	normalize: (value) => value.toLowerCase(),
	fail: () => new PrimitiveError("invalid_email"),
});
export type Email = Infer<typeof Email>;
