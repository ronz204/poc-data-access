import type { SignUpUserInput, SignUpUserOutput } from "./sign-up-user.schema";
import { type IUserRepository, User, UserName } from "@core/identity-access";
import { Email, UserId } from "@core/shared-kernel";
import { uuidv7 } from "uuidv7";

export class SignUpUserHandler {
	constructor(private readonly users: IUserRepository) {}

	async execute(input: SignUpUserInput): Promise<SignUpUserOutput> {
		const user = User.signUp(
			{ id: UserId.parse(uuidv7()), email: Email.parse(input.email), name: UserName.parse(input.name) },
			new Date(),
		);
		await this.users.insert(user);

		return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() };
	}
}
