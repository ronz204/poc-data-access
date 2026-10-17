import type { SignUpUserCommand, SignUpUserOutput } from "./sign-up-user.schema";
import { type IUserRepository, User } from "@core/identity-access";
import { UserId } from "@core/shared-kernel";
import { uuidv7 } from "uuidv7";

export class SignUpUserHandler {
	constructor(private readonly users: IUserRepository) {}

	async execute(command: SignUpUserCommand): Promise<SignUpUserOutput> {
		const user = User.signUp({ id: UserId.parse(uuidv7()), ...command }, new Date());
		await this.users.insert(user);

		return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() };
	}
}
