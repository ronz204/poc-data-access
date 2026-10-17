import { DomainError } from "@core/shared-kernel";

export class MembershipError extends DomainError.define({
	user_not_found: "the user does not exist",
	not_a_member: "the actor is not an active member of the tenant",
	member_not_found: "the target is not an active member of the tenant",
	insufficient_role: "the actor's role does not allow this action",
	last_owner: "the tenant must keep at least one active owner",
}) {}
