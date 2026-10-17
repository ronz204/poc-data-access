import { Aggregate, type Email, type EntityState, type UserId } from "@core/shared-kernel";
import type { UserName } from "./user.vos";

export interface UserState extends EntityState<UserId> {
	readonly email: Email;
	readonly name: UserName;
	readonly createdAt: Date;
}

export interface UserSignUpInput {
	readonly id: UserId;
	readonly email: Email;
	readonly name: UserName;
}

export class User extends Aggregate<UserState>() {
	private constructor(state: UserState) {
		super(state);
	}

	static signUp(input: UserSignUpInput, now: Date): User {
		return new User({ ...input, createdAt: now });
	}
}
