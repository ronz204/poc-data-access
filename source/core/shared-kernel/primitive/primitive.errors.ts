import { DomainError } from "../foundation/foundation.errors";

export class PrimitiveError extends DomainError.define({
	invalid_identifier: "the value is not a valid identifier",
	invalid_literal: "the value is not one of the allowed values",
	invalid_email: "the value is not a valid email address",
}) {}
