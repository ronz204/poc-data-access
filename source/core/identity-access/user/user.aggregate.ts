import { type Email, Entity, type EntityState, type UserId } from "@core/shared-kernel";
import type { UserName } from "./user.vos";

export interface UserState extends EntityState<UserId> {
	readonly email: Email;
	readonly name: UserName;
	readonly createdAt: Date;
}

export type UserSignUpInput = Omit<UserState, "createdAt">;

export class User extends Entity<UserState>() {
	private constructor(state: UserState) {
		super(state);
	}

	static signUp(input: UserSignUpInput, now: Date): User {
		return new User({ ...input, createdAt: now });
	}
}
