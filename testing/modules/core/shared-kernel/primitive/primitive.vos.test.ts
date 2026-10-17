import { Email, literalsOf, PrimitiveError, textOf, uuidOf } from "@core/shared-kernel";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

const VALID_UUID = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";

describe("uuidOf", () => {
	const Id = uuidOf("TestId");

	it("exposes its kind", () => {
		expect(Id.kind).toBe("TestId");
	});

	it("lowercases a valid uuid", () => {
		expect(Id.parse(VALID_UUID.toUpperCase())).toBe(VALID_UUID);
	});

	it.each(["", "not-a-uuid", `${VALID_UUID}0`, ` ${VALID_UUID}`, "0192f3a4-5b6c-7d8e-9f01-23456789abcg"])(
		"rejects %j",
		(value) => {
			expectDomainError(() => Id.parse(value), "invalid_identifier", { kind: "TestId" });
		},
	);

	it("raises a PrimitiveError", () => {
		expect(() => Id.parse("nope")).toThrow(PrimitiveError);
	});

	it("guards only values already in normalized form", () => {
		expect(Id.is(VALID_UUID)).toBe(true);
		expect(Id.is(VALID_UUID.toUpperCase())).toBe(false);
		expect(Id.is(42)).toBe(false);
		expect(Id.is(null)).toBe(false);
	});

	it("is frozen", () => {
		expect(Object.isFrozen(Id)).toBe(true);
	});
});

describe("textOf", () => {
	class TestTextError extends Error {
		constructor(
			message: string,
			readonly limits?: unknown,
		) {
			super(message);
		}
	}

	const Slug = textOf("Slug", {
		min: 2,
		max: 5,
		pattern: /^[a-z]+$/,
		normalize: (value) => value.toLowerCase(),
		fail: (limits) => new TestTextError("bad", limits),
	});

	it("trims before normalizing and validating", () => {
		expect(Slug.parse("  AbC  ")).toBe("abc");
	});

	it("passes the bounds to the failure factory", () => {
		let thrown: unknown;
		try {
			Slug.parse("a");
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(TestTextError);
		expect((thrown as TestTextError).limits).toEqual({ minLength: 2, maxLength: 5 });
	});

	it.each(["", "   ", "a", "abcdef", "ab1"])("rejects %j", (value) => {
		expect(() => Slug.parse(value)).toThrow(TestTextError);
	});

	it("accepts the exact bounds", () => {
		expect(Slug.parse("ab")).toBe("ab");
		expect(Slug.parse("abcde")).toBe("abcde");
	});

	it("defaults the minimum length to 1", () => {
		const Free = textOf("Free", { max: 3, fail: () => new TestTextError("bad") });
		expect(Free.parse(" x ")).toBe("x");
		expect(() => Free.parse("   ")).toThrow(TestTextError);
	});

	it("guards only values already in normalized form", () => {
		expect(Slug.is("abc")).toBe(true);
		expect(Slug.is(" abc")).toBe(false);
		expect(Slug.is("ABC")).toBe(false);
		expect(Slug.is("a")).toBe(false);
		expect(Slug.is(1)).toBe(false);
	});

	it("never reports true for a value parse would change", () => {
		for (const value of ["abc", " abc ", "ABC", "ab", "toolong", "ab1"]) {
			if (Slug.is(value)) expect(Slug.parse(value)).toBe(value);
		}
	});
});

describe("literalsOf", () => {
	const Role = literalsOf("Role", ["owner", "admin", "member"]);

	it("exposes kind and a frozen copy of its values", () => {
		expect(Role.kind).toBe("Role");
		expect(Role.values).toEqual(["owner", "admin", "member"]);
		expect(Object.isFrozen(Role.values)).toBe(true);
	});

	it("parses an allowed value", () => {
		expect(Role.parse("admin")).toBe("admin");
	});

	it("rejects anything else with the shared invalid_literal code", () => {
		expectDomainError(() => Role.parse("root"), "invalid_literal", { kind: "Role" });
	});

	it("uses the caller's error when given", () => {
		class CustomError extends Error {}
		const Strict = literalsOf("Strict", ["a"], () => new CustomError("custom"));
		expect(() => Strict.parse("b")).toThrow(CustomError);
	});

	it("guards by membership", () => {
		expect(Role.is("owner")).toBe(true);
		expect(Role.is("Owner")).toBe(false);
		expect(Role.is(undefined)).toBe(false);
	});
});

describe("Email", () => {
	it("trims and lowercases", () => {
		expect(Email.parse("  Ana.Perez@Example.COM ")).toBe("ana.perez@example.com");
	});

	it.each(["", "plain", "a@b", "@example.com", "a b@example.com", "a@@example.com"])("rejects %j", (value) => {
		expectDomainError(() => Email.parse(value), "invalid_email");
	});

	it("enforces the 254 character maximum", () => {
		const domain = "@example.com";
		const atLimit = `${"a".repeat(254 - domain.length)}${domain}`;
		expect(Email.parse(atLimit)).toBe(atLimit);
		expectDomainError(() => Email.parse(`a${atLimit}`), "invalid_email");
	});

	it("is idempotent", () => {
		const once = Email.parse(" A@B.CO ");
		expect(Email.parse(once)).toBe(once);
		expect(Email.is(once)).toBe(true);
		expect(Email.is("A@B.CO")).toBe(false);
	});
});
