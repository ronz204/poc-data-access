import type { TenantId, UserId } from "../identifier/identifier.vos";
import type { MembershipRole } from "./admission.vos";

export interface AdmissionView {
	readonly tenantId: TenantId;
	readonly userId: UserId;
	readonly role: MembershipRole;
}
