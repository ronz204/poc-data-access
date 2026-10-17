import { type IUserRepository, type User, UserError } from "@core/identity-access";
import type { RunExecutor } from "@dal/dal.transactor";
import { ViolationTranslator } from "@dal/dal.translator";
import type { UserId } from "@core/shared-kernel";
import { users } from "@db/models/platform/users.model";
import { UserMapper } from "./user.mapper";
import { eq } from "drizzle-orm";

export class UserRepository implements IUserRepository {
	constructor(private readonly executor: RunExecutor) {}

	async findById(id: UserId): Promise<User | null> {
		const [row] = await this.executor.select().from(users).where(eq(users.id, id)).limit(1);
		return row ? UserMapper.toDomain(row) : null;
	}

	async insert(user: User): Promise<void> {
		await ViolationTranslator.translate(this.executor.insert(users).values(UserMapper.toRow(user)), {
			users_email_key: () => new UserError("email_taken"),
		});
	}
}
