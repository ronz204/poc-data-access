import { SignUpUserHandler } from "@app/identity-access/sign-up-user/sign-up-user.handler";
import { toSignUpUserCommand } from "@app/identity-access/sign-up-user/sign-up-user.schema";
import { UserId } from "@core/shared-kernel";
import { InMemoryUserRepository } from "@testing/utilities/user.memory";
import { expectDomainError } from "@testing/utilities/domain.assertions";
import { beforeEach, describe, expect, it } from "vitest";

const FIXED_ID = "0192f3a4-5b6c-7d8e-9f01-23456789abcd";
const FIXED_TIME = new Date("2026-01-01T00:00:00.000Z");

describe("SignUpUserHandler", () => {
	let users: InMemoryUserRepository;
	let handler: SignUpUserHandler;

	beforeEach(() => {
		users = new InMemoryUserRepository();
		handler = new SignUpUserHandler(users, () => FIXED_TIME, () => FIXED_ID);
	});

	const command = toSignUpUserCommand({ email: " Ana@Example.COM ", name: " Ana " });

	it("returns the created user in its wire shape", async () => {
		const output = await handler.execute(command);
		expect(output).toEqual({
			id: FIXED_ID,
			email: "ana@example.com",
			name: "Ana",
			createdAt: "2026-01-01T00:00:00.000Z",
		});
	});

	it("stores the user with the injected id and time", async () => {
		await handler.execute(command);
		const stored = await users.findById(UserId.parse(FIXED_ID));
		expect(stored?.createdAt).toBe(FIXED_TIME);
		expect(stored?.email).toBe("ana@example.com");
	});

	it("lets the repository's email_taken failure through", async () => {
		await handler.execute(command);
		const second = new SignUpUserHandler(users, () => FIXED_TIME, () => "0192f3a4-5b6c-7d8e-9f01-23456789abce");
		await expect(second.execute(command)).rejects.toMatchObject({ code: "email_taken" });
		expect(users.stored.size).toBe(1);
	});

	it("rejects an id source that is not a valid identifier, before storing anything", async () => {
		const broken = new SignUpUserHandler(users, () => FIXED_TIME, () => "not-a-uuid");
		await expect(broken.execute(command)).rejects.toMatchObject({ code: "invalid_identifier" });
		expect(users.stored.size).toBe(0);
	});

	it("is deterministic for the same collaborators", async () => {
		const other = new SignUpUserHandler(new InMemoryUserRepository(), () => FIXED_TIME, () => FIXED_ID);
		expect(await handler.execute(command)).toEqual(await other.execute(command));
	});

	it("keeps the domain failure type", () => {
		expectDomainError(() => toSignUpUserCommand({ email: "nope", name: "Ana" }), "invalid_email");
	});
});
