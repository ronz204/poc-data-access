import { User, UserName } from "@core/identity-access";
import { Email, UserId } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

const input = {
	id: UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcd"),
	email: Email.parse("ana@example.com"),
	name: UserName.parse("Ana"),
};

describe("User", () => {
	const now = new Date("2026-01-01T00:00:00.000Z");

	it("signs up with the given input and the caller's clock", () => {
		const user = User.signUp(input, now);
		expect(user).toBeInstanceOf(User);
		expect(user.id).toBe(input.id);
		expect(user.email).toBe(input.email);
		expect(user.name).toBe(input.name);
		expect(user.createdAt).toBe(now);
	});

	it("is deterministic for the same input and clock", () => {
		expect({ ...User.signUp(input, now) }).toEqual({ ...User.signUp(input, now) });
	});

	it("restores from a stored state without altering it", () => {
		const restored = User.restore({ ...input, createdAt: now });
		expect(restored).toBeInstanceOf(User);
		expect(restored.createdAt).toBe(now);
	});

	it("is the same user as another restore of the same id", () => {
		const first = User.restore({ ...input, createdAt: now });
		const second = User.restore({ ...input, name: UserName.parse("Renamed"), createdAt: now });
		expect(first.sameAs(second)).toBe(true);
	});
});
