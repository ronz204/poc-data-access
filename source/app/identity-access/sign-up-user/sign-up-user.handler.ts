import type { SignUpUserCommand, SignUpUserOutput } from "./sign-up-user.schema";
import { type IUserRepository, User } from "@core/identity-access";
import type { Clock, NewId } from "@keys/system.dockey";
import { UserId } from "@core/shared-kernel";

export class SignUpUserHandler {
	constructor(
		private readonly users: IUserRepository,
		private readonly now: Clock,
		private readonly newId: NewId,
	) {}

	async execute(command: SignUpUserCommand): Promise<SignUpUserOutput> {
		const user = User.signUp({ id: UserId.parse(this.newId()), ...command }, this.now());
		await this.users.insert(user);

		return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() };
	}
}
