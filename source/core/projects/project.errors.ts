export class ProjectSlugTakenError extends Error {
	constructor(readonly slug: string) {
		super(`project slug "${slug}" is already taken`);
		this.name = "ProjectSlugTakenError";
	}
}

export class ProjectNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`project "${id}" was not found`);
		this.name = "ProjectNotFoundError";
	}
}

export class InvalidProjectNameError extends Error {
	constructor(readonly value: string) {
		super(`project name "${value}" is invalid`);
		this.name = "InvalidProjectNameError";
	}
}
