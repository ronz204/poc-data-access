import { DomainError } from "../foundation/foundation.errors";

export class AdmissionError extends DomainError.define({
	not_a_member: "the actor is not an active member of the tenant",
	insufficient_role: "the actor's role does not allow this action",
}) {}
