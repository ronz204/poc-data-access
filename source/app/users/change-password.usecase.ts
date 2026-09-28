import type { UserId } from "@core/users/user.ids";
import type { UserRepository } from "@core/users/user.repository";
import type { Chronicler } from "@dal/dal.chronicler";

export class ChangePassword {
	constructor(
		private readonly users: UserRepository,
		private readonly chronicler: Chronicler,
		private readonly actorId: string,
	) {}

	async execute(passwordHash: string): Promise<void> {
		const user = await this.users.find(this.actorId as UserId);
		user.changePassword(passwordHash);
		await this.users.update(user);
		await this.chronicler.record({
			action: "user.password_changed",
			entity: "users",
			entityId: user.id,
		});
	}
}
