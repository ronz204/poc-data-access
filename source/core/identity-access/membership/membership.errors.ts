import { DomainError } from "@core/shared-kernel";

export class MembershipError extends DomainError.define({
	user_not_found: "the user does not exist",
	member_not_found: "the target is not an active member of the tenant",
	last_owner: "the tenant must keep at least one active owner",
}) {}
