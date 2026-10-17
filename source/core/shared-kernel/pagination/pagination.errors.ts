import { DomainError } from "../foundation/foundation.errors";

export class PaginationError extends DomainError.define({
	invalid_cursor: "the cursor is not one this list issued",
}) {}
