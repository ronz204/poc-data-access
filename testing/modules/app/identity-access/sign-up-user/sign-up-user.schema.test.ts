import { SignUpUserInput, toSignUpUserCommand } from "@app/identity-access/sign-up-user/sign-up-user.schema";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { describe, expect, it } from "vitest";

describe("SignUpUserInput", () => {
	it("accepts a well formed body", () => {
		expect(SignUpUserInput.safeParse({ email: "a@b.co", name: "Ana" }).success).toBe(true);
	});

	it.each([{}, { email: "a@b.co" }, { name: "Ana" }, { email: 1, name: "Ana" }])("rejects the shape %j", (body) => {
		expect(SignUpUserInput.safeParse(body).success).toBe(false);
	});

	it("bounds the wire lengths without deciding what a valid email is", () => {
		expect(SignUpUserInput.safeParse({ email: "x".repeat(321), name: "Ana" }).success).toBe(false);
		expect(SignUpUserInput.safeParse({ email: "x".repeat(320), name: "Ana" }).success).toBe(true);
		expect(SignUpUserInput.safeParse({ email: "a@b.co", name: "n".repeat(201) }).success).toBe(false);
	});
});

describe("toSignUpUserCommand", () => {
	it("turns wire values into normalized domain values", () => {
		expect(toSignUpUserCommand({ email: "  Ana@Example.COM ", name: "  Ana " })).toEqual({
			email: "ana@example.com",
			name: "Ana",
		});
	});

	it("raises the email failure before the name one", () => {
		expectDomainError(() => toSignUpUserCommand({ email: "nope", name: "" }), "invalid_email");
	});

	it("raises invalid_name with its bounds", () => {
		expectDomainError(() => toSignUpUserCommand({ email: "a@b.co", name: "   " }), "invalid_name", {
			minLength: 1,
			maxLength: 120,
		});
	});
});
