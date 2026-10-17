import { type AdmissionView, AdmissionPolicy } from "@core/shared-kernel";
import type { AdmissionQuery } from "@repos/identity-access/membership/admission.query";
import type { RunContext } from "@dal/dal.contexter";

export class AdmitActorHandler {
	constructor(
		private readonly admission: AdmissionQuery,
		private readonly context: RunContext,
	) {}

	async execute(): Promise<AdmissionView> {
		return AdmissionPolicy.admit(await this.admission.execute(this.context.tenant, this.context.actor));
	}
}
