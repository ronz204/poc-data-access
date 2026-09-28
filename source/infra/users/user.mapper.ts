import { User, type UserSnapshot } from "@core/users/user.entity";
import type { UserId } from "@core/users/user.ids";
import type { users } from "@db/models/users.model";

type UserRow = typeof users.$inferSelect;
type UserInsert = typeof users.$inferInsert;

export class UserMapper {
	static toDomain(row: UserRow): User {
		return User.reconstitute({
			id: row.id as UserId,
			email: row.email,
			name: row.name,
			passwordHash: row.passwordHash,
			createdAt: row.createdAt,
		});
	}

	static toRow(snapshot: UserSnapshot): UserInsert {
		return { ...snapshot };
	}
}
