import { AdmissionError } from "@core/shared-kernel";
import type { Membership } from "./membership.aggregate";
import { MembershipError } from "./membership.errors";

export class MembershipPolicy {
	static assertCanChangeRole(actor: Membership): void {
		if (actor.role !== "owner") throw new AdmissionError("insufficient_role");
	}

	static assertCanRemove(actor: Membership, target: Membership): void {
		if (actor.role === "owner") return;
		if (actor.role === "admin" && target.role === "member") return;
		throw new AdmissionError("insufficient_role");
	}

	static assertKeepsOwner(target: Membership, activeOwners: number): void {
		if (target.isOwner() && activeOwners <= 1) throw new MembershipError("last_owner");
	}
}
