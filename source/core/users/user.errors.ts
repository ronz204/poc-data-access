export class EmailTakenError extends Error {
	constructor(readonly email: string) {
		super(`email "${email}" is already taken`);
		this.name = "EmailTakenError";
	}
}

export class UserNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`user "${id}" was not found`);
		this.name = "UserNotFoundError";
	}
}

export class InvalidPasswordError extends Error {
	constructor() {
		super("password cannot be empty");
		this.name = "InvalidPasswordError";
	}
}
