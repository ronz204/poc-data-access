import { type IUserRepository, type User, UserError } from "@core/identity-access";
import type { UserId } from "@core/shared-kernel";

export class InMemoryUserRepository implements IUserRepository {
	readonly stored = new Map<UserId, User>();

	async findById(id: UserId): Promise<User | null> {
		return this.stored.get(id) ?? null;
	}

	async insert(user: User): Promise<void> {
		for (const existing of this.stored.values()) {
			if (existing.email === user.email) throw new UserError("email_taken");
		}
		this.stored.set(user.id, user);
	}
}
