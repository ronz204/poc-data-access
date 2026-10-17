import { DomainError } from "@core/shared-kernel/foundation/foundation.errors";

export class EmailError extends DomainError.define({
	invalid_email: "the value is not a valid email address",
}) {}
