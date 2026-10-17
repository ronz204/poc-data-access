import type { UserId } from "@core/shared-kernel";
import type { User } from "./user.aggregate";

export interface IUserRepository {
	findById(id: UserId): Promise<User | null>;
	insert(user: User): Promise<void>;
}
