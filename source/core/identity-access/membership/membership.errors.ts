import { DomainError } from "@core/shared-kernel";

export class MembershipError extends DomainError.define({
	user_not_found: "the user does not exist",
}) {}
