import { DomainError } from "@core/shared-kernel";

export class UserError extends DomainError.define({
	invalid_name: "the name must not be empty and must fit the maximum length",
	email_taken: "the email already belongs to a user",
}) {}
