import type { User } from "@core/users/user.entity";
import type { UserId } from "@core/users/user.ids";

export interface UserRepository {
	find(id: UserId): Promise<User>;
	add(user: User): Promise<void>;
	update(user: User): Promise<void>;
}
