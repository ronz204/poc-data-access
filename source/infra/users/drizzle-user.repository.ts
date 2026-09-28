import type { User } from "@core/users/user.entity";
import { EmailTakenError, UserNotFoundError } from "@core/users/user.errors";
import type { UserId } from "@core/users/user.ids";
import type { UserRepository } from "@core/users/user.repository";
import { ViolationTranslator } from "@dal/dal.translator";
import type { Executor } from "@db/helpers/executor.helper";
import { UserConstraints, users } from "@db/models/users.model";
import { UserMapper } from "@infra/users/user.mapper";
import { eq } from "drizzle-orm";

export class DrizzleUserRepository implements UserRepository {
	constructor(private readonly tx: Executor) {}

	async find(id: UserId): Promise<User> {
		const [row] = await this.tx.select().from(users).where(eq(users.id, id));
		if (!row) throw new UserNotFoundError(id);
		return UserMapper.toDomain(row);
	}

	async add(user: User): Promise<void> {
		const row = UserMapper.toRow(user.snapshot());
		await ViolationTranslator.translate(this.tx.insert(users).values(row), {
			[UserConstraints.email]: () => new EmailTakenError(row.email),
		});
	}

	async update(user: User): Promise<void> {
		const { id, ...changes } = UserMapper.toRow(user.snapshot());
		await ViolationTranslator.translate(
			this.tx
				.update(users)
				.set(changes)
				.where(eq(users.id, id as UserId)),
			{ [UserConstraints.email]: () => new EmailTakenError(changes.email) },
		);
	}
}
