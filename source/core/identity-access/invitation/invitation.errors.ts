import { DomainError } from "@core/shared-kernel";

export class InvitationError extends DomainError.define({
	invalid_token_hash: "the token hash must be a lowercase sha-256 digest",
	insufficient_role: "the actor's role does not allow this action",
	already_member: "the email already belongs to an active member of the tenant",
	invitation_pending: "a pending invitation already exists for the email",
	invitation_invalid: "the invitation is unknown, expired, revoked or already accepted",
	invitation_not_found: "the invitation does not exist in the tenant",
	not_pending: "only a pending invitation can be revoked",
	name_required: "a name is required because no user exists for the invitation's email",
}) {}
