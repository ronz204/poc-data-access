import { InvalidPasswordError } from "@core/users/user.errors";
import type { UserId } from "@core/users/user.ids";

export interface UserSnapshot {
	readonly id: UserId;
	readonly email: string;
	readonly name: string;
	readonly passwordHash: string;
	readonly createdAt: Date;
}

export class User {
	private constructor(private state: UserSnapshot) {}

	static create(id: UserId, email: string, name: string, passwordHash: string): User {
		return new User({ id, email, name, passwordHash, createdAt: new Date() });
	}

	static reconstitute(snapshot: UserSnapshot): User {
		return new User(snapshot);
	}

	get id(): UserId {
		return this.state.id;
	}

	changePassword(passwordHash: string): void {
		if (passwordHash.length === 0) throw new InvalidPasswordError();
		this.state = { ...this.state, passwordHash };
	}

	snapshot(): UserSnapshot {
		return this.state;
	}
}
