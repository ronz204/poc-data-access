import { User, UserName } from "@core/identity-access";
import { Email, UserId } from "@core/shared-kernel";
import type { users } from "@db/models/platform/users.model";

type UserRow = typeof users.$inferSelect;

export class UserMapper {
	static toRow(user: User): UserRow {
		return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
	}

	static toDomain(row: UserRow): User {
		return User.restore({
			id: UserId.parse(row.id),
			email: Email.parse(row.email),
			name: UserName.parse(row.name),
			createdAt: row.createdAt,
		});
	}
}
